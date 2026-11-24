import Foundation

enum APIError: Error, Equatable {
    /// Device is offline or the server is unreachable.
    case network
    /// 401 — token missing, expired or revoked.
    case unauthorized(message: String)
    /// 403 — e.g. deactivated account.
    case forbidden(message: String)
    case server(status: Int, message: String)
    case decoding

    var message: String {
        switch self {
        case .network: "Can't reach the server."
        case .unauthorized(let m), .forbidden(let m): m
        case .server(_, let m): m
        case .decoding: "Unexpected response from the server."
        }
    }
}

/// `{ success, data }` wrapper used by the app endpoints.
struct Envelope<T: Decodable>: Decodable { let data: T }

private struct ErrorBody: Decodable { let message: String? }

/// Thin JSON-over-HTTP client. Attaches the bearer token and maps failures to `APIError`.
final class APIClient: Sendable {
    static let shared = APIClient()

    private let session: URLSession
    private static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        let plain = ISO8601DateFormatter()
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            if let date = fractional.date(from: text) ?? plain.date(from: text) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Bad date \(text)"))
        }
        return decoder
    }

    init(session: URLSession = .shared) { self.session = session }

    /// Decodes the response body as `T` directly (auth endpoints are not enveloped).
    func send<T: Decodable>(_ method: String = "GET", _ path: String, query: [String: String?] = [:],
                            body: (any Encodable & Sendable)? = nil, authorized: Bool = true) async throws -> T {
        var components = URLComponents(url: APIConfig.baseURL.appending(path: "api" + path), resolvingAgainstBaseURL: false)!
        let items = query.compactMap { key, value in value.map { URLQueryItem(name: key, value: $0) } }
        if !items.isEmpty { components.queryItems = items.sorted { $0.name < $1.name } }

        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let sentToken = authorized ? TokenStore.accessToken : nil
        if let sentToken { request.setValue("Bearer \(sentToken)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }

        let data: Data, response: URLResponse
        do { (data, response) = try await session.data(for: request) }
        catch { throw APIError.network }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? Self.makeDecoder().decode(ErrorBody.self, from: data))?.message ?? "Request failed (\(status))."
            switch status {
            case 401:
                // Only a rejected session token means the user is signed out; sign-in calls are unauthenticated.
                if let sentToken, sentToken == TokenStore.accessToken { NotificationCenter.default.post(name: .sessionExpired, object: nil) }
                throw APIError.unauthorized(message: message)
            case 403: throw APIError.forbidden(message: message)
            default: throw APIError.server(status: status, message: message)
            }
        }
        do { return try Self.makeDecoder().decode(T.self, from: data) }
        catch { throw APIError.decoding }
    }

    /// Decodes the `data` member of a `{ success, data }` response.
    func data<T: Decodable>(_ method: String = "GET", _ path: String, query: [String: String?] = [:],
                            body: (any Encodable & Sendable)? = nil) async throws -> T {
        let envelope: Envelope<T> = try await send(method, path, query: query, body: body)
        return envelope.data
    }
}

private struct AnyEncodable: Encodable {
    let value: any Encodable & Sendable
    init(_ value: any Encodable & Sendable) { self.value = value }
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}
