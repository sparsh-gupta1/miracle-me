import Foundation

// MARK: Auth & profile

struct OTPRequestResult: Decodable, Sendable {
    let userId: String
    let isNewUser: Bool
}

struct AuthTokens: Decodable, Sendable {
    let accessToken: String
    let refreshToken: String
}

struct AuthResult: Decodable, Sendable {
    let user: UserDTO
    let tokens: AuthTokens
}

struct UserDTO: Decodable, Sendable {
    let id: String
    let role: String
    let name: String?
    let mobileNumber: String?
    let gender: String?
    let dateOfBirth: String?
    let birthTime: String?
    let birthPlace: String?

    var isExpert: Bool { role == "astrologer" || role == "listener" }
}

/// Fields the onboarding screens collect. `nil` leaves the stored value untouched.
struct ProfileUpdate: Encodable, Sendable {
    var name: String?
    var gender: String?
    var dateOfBirth: String?
    var birthTime: String?
    var birthPlace: String?
}

// MARK: Experts

struct ExpertDTO: Decodable, Sendable, Identifiable {
    struct Pricing: Decodable, Sendable {
        let chat: Double?
        let audio: Double?
        let video: Double?
    }

    let id: String
    let name: String
    let role: String
    let headline: String?
    let specialty: String?
    let rating: Double?
    let reviewCount: Int?
    let languages: [String]?
    let gender: String?
    let experienceYears: Int?
    let status: String
    let isFavorite: Bool?
    let profileImage: String?
    let pricing: Pricing?
}

struct ExpertPage: Decodable, Sendable {
    let experts: [ExpertDTO]
    let totalCount: Int
    let hasMore: Bool
}

struct ReviewDTO: Decodable, Sendable {
    let author: String
    let when: String
    let text: String
    let rating: Double?
}

struct ExpertDetailDTO: Decodable, Sendable {
    struct FreeMinutes: Decodable, Sendable {
        let chat: Int
        let audio: Int
        let video: Int
    }

    let expert: ExpertDTO
    let about: String?
    let specialities: [String]?
    let featuredReview: ReviewDTO?
    let freeMinutes: FreeMinutes?

    private enum Keys: String, CodingKey { case about, specialities, featuredReview, freeMinutes }

    init(from decoder: Decoder) throws {
        expert = try ExpertDTO(from: decoder)
        let container = try decoder.container(keyedBy: Keys.self)
        about = try container.decodeIfPresent(String.self, forKey: .about)
        specialities = try container.decodeIfPresent([String].self, forKey: .specialities)
        featuredReview = try container.decodeIfPresent(ReviewDTO.self, forKey: .featuredReview)
        freeMinutes = try container.decodeIfPresent(FreeMinutes.self, forKey: .freeMinutes)
    }
}

struct QuoteDTO: Decodable, Sendable {
    let service: String
    let pricePerMinute: Double
    let balance: Double
    let freeMinutes: Int
    let talkMinutes: Int
    let hasSufficientBalance: Bool
    let rechargeAmount: Int
}

struct FavouriteResult: Decodable, Sendable { let isFavorite: Bool }

/// Server-side filter parameters for `GET /experts`.
struct ExpertQuery: Sendable {
    var kind: String?
    var text: String?
    var onlineOnly = false
    var minRating: Double?
    var minPrice: Int?
    var maxPrice: Int?
    var language: String?
    var gender: String?
    var minExperience: Int?
    var maxExperience: Int?
    var favouritesOnly = false

    var parameters: [String: String?] {
        [
            "kind": kind,
            "q": text.flatMap { $0.isEmpty ? nil : $0 },
            "onlineOnly": onlineOnly ? "true" : nil,
            "minRating": minRating.map { String($0) },
            "minPrice": minPrice.map(String.init),
            "maxPrice": maxPrice.map(String.init),
            "language": language,
            "gender": gender,
            "minExperience": minExperience.map(String.init),
            "maxExperience": maxExperience.map(String.init),
            "favouritesOnly": favouritesOnly ? "true" : nil,
        ]
    }
}

// MARK: Wallet

struct WalletDTO: Decodable, Sendable { let balance: Double }

struct TopUpBody: Encodable, Sendable { let amount: Int }

// MARK: Sessions

struct SessionsDTO: Decodable, Sendable {
    struct Active: Decodable, Sendable {
        let id: String
        let serviceType: String
        let expert: ExpertDTO
        let startedAt: Date?
        let elapsedSeconds: Int
        let remainingSeconds: Int?
    }
    struct Thread: Decodable, Sendable {
        let chatId: String
        let expert: ExpertDTO
        let lastMessage: String?
        let lastMessageAt: Date?
        let unreadCount: Int
    }
    struct Past: Decodable, Sendable {
        let id: String
        let serviceType: String
        let expert: ExpertDTO
        let durationMinutes: Int
        let endedAt: Date?
    }

    let active: [Active]
    let threads: [Thread]
    let past: [Past]
}

// MARK: Intro video

struct IntroVideoDTO: Decodable, Sendable {
    let id: String
    let title: String?
    let videoUrl: String?
    let isViewed: Bool
}
