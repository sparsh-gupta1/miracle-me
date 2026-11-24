import Foundation

private struct OTPRequestBody: Encodable, Sendable { let mobileNumber: String }
private struct OTPVerifyBody: Encodable, Sendable { let uuid: String; let otp: String }
private struct FavouriteBody: Encodable, Sendable { let favoriteUserId: String }

/// Typed access to the Miracle Me backend.
struct MiracleAPI: Sendable {
    var client: APIClient = .shared

    // Auth (responses are not enveloped)
    func requestOTP(mobile: String) async throws -> OTPRequestResult {
        try await client.send("POST", "/auth/request-otp", body: OTPRequestBody(mobileNumber: mobile), authorized: false)
    }

    func verifyOTP(userId: String, code: String) async throws -> AuthResult {
        try await client.send("POST", "/auth/verify-otp", body: OTPVerifyBody(uuid: userId, otp: code), authorized: false)
    }

    func logout() async {
        struct Ignored: Decodable {}
        _ = try? await client.send("PUT", "/auth/logout") as Ignored
    }

    // Profile
    func me() async throws -> UserDTO { try await client.data("GET", "/user/me") }
    func updateMe(_ update: ProfileUpdate) async throws -> UserDTO { try await client.data("PATCH", "/user/me", body: update) }

    // Experts
    func experts(_ query: ExpertQuery = .init()) async throws -> ExpertPage {
        try await client.data("GET", "/experts", query: query.parameters)
    }

    func expert(id: String) async throws -> ExpertDetailDTO { try await client.data("GET", "/experts/\(id)") }

    func quote(expertID: String, service: String) async throws -> QuoteDTO {
        try await client.data("GET", "/experts/\(expertID)/quote", query: ["service": service])
    }

    func toggleFavourite(expertID: String) async throws -> Bool {
        let result: FavouriteResult = try await client.data("POST", "/user/favorites", body: FavouriteBody(favoriteUserId: expertID))
        return result.isFavorite
    }

    // Wallet
    func balance() async throws -> Double {
        let wallet: WalletDTO = try await client.data("GET", "/wallet")
        return wallet.balance
    }

    /// Demo-only top-up (the real payment flow is not wired yet).
    func demoTopUp(amount: Int) async throws -> Double {
        let wallet: WalletDTO = try await client.data("POST", "/wallet/demo-topup", body: TopUpBody(amount: amount))
        return wallet.balance
    }

    // Sessions
    func sessions() async throws -> SessionsDTO { try await client.data("GET", "/sessions") }

    // Intro video
    func introVideo() async throws -> IntroVideoDTO { try await client.data("GET", "/intro-video/active") }

    func markIntroVideoViewed(id: String) async {
        struct Ignored: Decodable {}
        _ = try? await client.send("POST", "/intro-video/\(id)/mark-viewed") as Ignored
    }
}
