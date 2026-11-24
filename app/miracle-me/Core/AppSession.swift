import Foundation
import Observation

/// Who is signed in, plus the shared API and realtime connection.
@Observable
@MainActor
final class AppSession {
    enum Restore { case signedIn(UserDTO), signedOut, expired, unreachable }

    let api = MiracleAPI()
    let socket = SocketClient()
    private(set) var user: UserDTO?

    init() {
        NotificationCenter.default.addObserver(forName: .sessionExpired, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.endSession() }
        }
    }

    // MARK: Sign in

    /// Sends the one-time code. Returns the id the verification step needs.
    func requestCode(mobile: String) async throws -> OTPRequestResult {
        try await api.requestOTP(mobile: mobile)
    }

    /// Verifies the code, stores the tokens and opens the realtime connection.
    func verify(userId: String, code: String) async throws -> UserDTO {
        let result = try await api.verifyOTP(userId: userId, code: code)
        TokenStore.accessToken = result.tokens.accessToken
        TokenStore.refreshToken = result.tokens.refreshToken
        user = result.user
        socket.connect(token: result.tokens.accessToken)
        return result.user
    }

    /// Re-establishes a previous session from the stored token.
    func restore() async -> Restore {
        guard let token = TokenStore.accessToken else { return .signedOut }
        do {
            let me = try await api.me()
            user = me
            socket.connect(token: token)
            return .signedIn(me)
        } catch APIError.unauthorized {
            endSession()
            return .expired
        } catch {
            return .unreachable
        }
    }

    func signOut() async {
        await api.logout()
        endSession()
    }

    /// Clears local credentials (also used when the server rejects the token).
    func endSession() {
        TokenStore.clear()
        socket.disconnect()
        user = nil
    }

    // MARK: Profile

    func saveProfile(_ draft: ProfileDraft) async throws {
        user = try await api.updateMe(draft.profileUpdate)
    }

    func saveBirthDetails(_ draft: ProfileDraft) async throws {
        user = try await api.updateMe(draft.birthUpdate)
    }
}

extension Notification.Name {
    /// Posted when an authorised request comes back 401.
    static let sessionExpired = Notification.Name("miracleMeSessionExpired")
}

extension ProfileDraft {
    private static let dateOnly: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
    private static let timeOnly: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "HH:mm"
        return formatter
    }()

    var profileUpdate: ProfileUpdate {
        ProfileUpdate(
            name: name.trimmingCharacters(in: .whitespaces),
            gender: gender.map { $0.apiValue },
            dateOfBirth: dateOfBirth.map(Self.dateOnly.string(from:)))
    }

    var birthUpdate: ProfileUpdate {
        ProfileUpdate(
            dateOfBirth: birthDate.map(Self.dateOnly.string(from:)),
            birthTime: doesNotKnowBirthTime ? nil : birthTime.map(Self.timeOnly.string(from:)),
            birthPlace: birthPlace.trimmingCharacters(in: .whitespaces).isEmpty ? nil : birthPlace)
    }
}

extension Gender {
    var apiValue: String {
        switch self {
        case .male: "male"
        case .female: "female"
        case .other: "other"
        }
    }
}
