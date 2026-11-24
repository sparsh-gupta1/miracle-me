import Foundation

/// One Socket.IO event received from the server. `payload` is the first argument as JSON.
struct SocketEvent: Sendable {
    let name: String
    let payload: Data?

    func decode<T: Decodable>(_ type: T.Type) -> T? {
        guard let payload else { return nil }
        return try? JSONDecoder().decode(T.self, from: payload)
    }
}

/// Minimal Socket.IO v4 client (Engine.IO v4, WebSocket transport, default namespace).
///
/// The backend speaks Socket.IO, and the maintained Swift package is stale (last release Oct 2024),
/// so this implements just what the app needs: connect with a JWT, emit events, receive events,
/// answer pings and reconnect with backoff.
@MainActor
final class SocketClient {
    enum State { case disconnected, connecting, connected }

    private(set) var state: State = .disconnected
    private var task: URLSessionWebSocketTask?
    private var token: String?
    private var retry = 0
    private var listeners: [UUID: AsyncStream<SocketEvent>.Continuation] = [:]
    private var generation = 0
    /// Drops a half-open connection: the server pings every `pingInterval`, so silence for
    /// `pingInterval + pingTimeout` means the link is dead even though the socket looks open.
    private var watchdog: Task<Void, Never>?
    private var silenceLimit: Duration = .seconds(45)

    /// Event name delivered to listeners when an established connection is lost.
    static let disconnectedEvent = "socket:disconnected"

    /// Starts (or restarts) the connection with the given access token.
    func connect(token: String) {
        self.token = token
        open()
    }

    func disconnect() {
        token = nil
        generation += 1
        watchdog?.cancel()
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        state = .disconnected
    }

    /// A stream of every event received until the consumer stops iterating.
    func events() -> AsyncStream<SocketEvent> {
        let id = UUID()
        return AsyncStream(bufferingPolicy: .bufferingNewest(64)) { continuation in
            listeners[id] = continuation
            continuation.onTermination = { [weak self] _ in Task { @MainActor in self?.listeners[id] = nil } }
        }
    }

    /// Resolves once the socket is connected, or `false` after `timeout` seconds.
    func waitUntilConnected(timeout: TimeInterval = 5) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while state != .connected, Date() < deadline { try? await Task.sleep(for: .milliseconds(100)) }
        return state == .connected
    }

    func emit(_ event: String, _ payload: some Encodable) {
        guard state == .connected, let task,
              let name = try? JSONEncoder().encode(event), let body = try? JSONEncoder().encode(payload) else { return }
        let frame = "42[" + String(decoding: name, as: UTF8.self) + "," + String(decoding: body, as: UTF8.self) + "]"
        task.send(.string(frame)) { _ in }
    }

    // MARK: Connection

    private func open() {
        guard let token else { return }
        generation += 1
        let current = generation
        task?.cancel(with: .goingAway, reason: nil)

        var components = URLComponents(url: APIConfig.baseURL.appending(path: "socket.io/"), resolvingAgainstBaseURL: false)!
        components.scheme = components.scheme == "https" ? "wss" : "ws"
        components.queryItems = [.init(name: "EIO", value: "4"), .init(name: "transport", value: "websocket")]
        let task = URLSession.shared.webSocketTask(with: components.url!)
        self.task = task
        state = .connecting
        task.resume()
        Task { await receiveLoop(task, token: token, generation: current) }
    }

    private func receiveLoop(_ task: URLSessionWebSocketTask, token: String, generation current: Int) async {
        while current == generation {
            do {
                let message = try await task.receive()
                guard case .string(let text) = message else { continue }
                handle(text, task: task, token: token)
            } catch {
                break
            }
        }
        guard current == generation, self.token != nil else { return }
        state = .disconnected
        watchdog?.cancel()
        broadcast(SocketEvent(name: Self.disconnectedEvent, payload: nil))
        retry += 1
        let delay = min(Double(1 << min(retry, 4)), 10)
        try? await Task.sleep(for: .seconds(delay))
        if current == generation { open() }
    }

    private func broadcast(_ event: SocketEvent) {
        for continuation in listeners.values { continuation.yield(event) }
    }

    private func armWatchdog(for task: URLSessionWebSocketTask) {
        watchdog?.cancel()
        let limit = silenceLimit
        watchdog = Task { [weak task] in
            try? await Task.sleep(for: limit)
            if !Task.isCancelled { task?.cancel(with: .goingAway, reason: nil) }
        }
    }

    private func handle(_ text: String, task: URLSessionWebSocketTask, token: String) {
        switch text.first {
        case "0":   // Engine.IO open → join the default namespace with the JWT
            if let data = text.dropFirst().data(using: .utf8),
               let info = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let interval = info["pingInterval"] as? Double, let timeout = info["pingTimeout"] as? Double {
                silenceLimit = .milliseconds(Int(interval + timeout) + 2000)
            }
            armWatchdog(for: task)
            let auth = (try? JSONEncoder().encode(["token": token])).map { String(decoding: $0, as: UTF8.self) } ?? "{}"
            task.send(.string("40" + auth)) { _ in }
        case "2":   // ping
            armWatchdog(for: task)
            task.send(.string("3")) { _ in }
        case "4":
            handleSocketIO(String(text.dropFirst()))
        default:
            break
        }
    }

    private func handleSocketIO(_ packet: String) {
        switch packet.first {
        case "0":
            state = .connected
            retry = 0
        case "4":   // connect_error (bad token etc.)
            state = .disconnected
        case "2":
            // `2[<event>,<payload>]`, optionally with an ack id before the array.
            let body = packet.dropFirst().drop { $0.isNumber }
            guard let data = body.data(using: .utf8),
                  let array = try? JSONSerialization.jsonObject(with: data) as? [Any],
                  let name = array.first as? String else { return }
            let payload = array.count > 1 ? try? JSONSerialization.data(withJSONObject: array[1], options: [.fragmentsAllowed]) : nil
            let event = SocketEvent(name: name, payload: payload)
            broadcast(event)
        default:
            break
        }
    }
}
