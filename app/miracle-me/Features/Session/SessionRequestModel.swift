import Foundation
import Observation

/// One consultation request (chat / audio / video) from sending it to the expert's answer.
@Observable
@MainActor
final class SessionRequestModel {
    enum Outcome: Equatable {
        case accepted
        case rejected
        case timedOut
        case cancelled
        case failed(String)
    }

    private struct RequestSent: Decodable { let request_id: String }
    private struct RequestRef: Decodable { let request_id: String }
    private struct ErrorPayload: Decodable { let message: String? }
    private struct CallRequest: Encodable { let request_type: String; let receiver_id: String }
    private struct CancelRequest: Encodable { let request_id: String }

    let expert: Expert
    let service: ConsultService

    private let socket: SocketClient
    private var requestID: String?
    private var cancelRequested = false
    private var task: Task<Outcome, Never>?

    init(expert: Expert, service: ConsultService, socket: SocketClient) {
        self.expert = expert
        self.service = service
        self.socket = socket
    }

    /// Sends the request and resolves when the expert answers, the request times out or fails.
    func run() async -> Outcome {
        let task = Task { await self.perform() }
        self.task = task
        return await task.value
    }

    /// Withdraws the request while it is still ringing.
    func cancel() {
        cancelRequested = true
        if let requestID { socket.emit("call-request:cancel", CancelRequest(request_id: requestID)) }
        task?.cancel()
    }

    private func perform() async -> Outcome {
        guard await socket.waitUntilConnected() else { return .failed("Can't reach the server. Check your connection.") }

        // Subscribe before emitting so a fast reply can't be missed.
        let events = socket.events()
        socket.emit("call-request", CallRequest(request_type: service.apiName, receiver_id: expert.id))

        for await event in events {
            if Task.isCancelled || cancelRequested { return .cancelled }
            switch event.name {
            case "call-request:sent":
                guard let sent = event.decode(RequestSent.self) else { continue }
                requestID = sent.request_id
                if cancelRequested {
                    socket.emit("call-request:cancel", CancelRequest(request_id: sent.request_id))
                    return .cancelled
                }
            case "call-request:accepted":
                if matches(event) { return .accepted }
            case "call-request:rejected":
                if matches(event) { return .rejected }
            case "call-timeout":
                if matches(event) { return .timedOut }
            case "call-ended":
                if matches(event) { return .failed("The request was ended.") }
            case SocketClient.disconnectedEvent:
                // Replies sent while offline are lost, so the outcome is unknown: don't claim anything about charges.
                return .failed("Connection lost. Please check the Chats tab and try again.")
            case "call-request:error":
                return .failed(event.decode(ErrorPayload.self)?.message ?? "Couldn't start the session.")
            default:
                break
            }
        }
        return .cancelled
    }

    /// Events carry the request id; ignore ones for other requests.
    private func matches(_ event: SocketEvent) -> Bool {
        guard let requestID, let ref = event.decode(RequestRef.self) else { return false }
        return ref.request_id == requestID
    }
}
