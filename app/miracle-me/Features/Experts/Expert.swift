import SwiftUI

enum ExpertKind: Hashable { case astrologer, listener }

enum ExpertStatus {
    case online, busy, offline

    var title: LocalizedStringKey {
        switch self {
        case .online: "status.online"
        case .busy: "status.busy"
        case .offline: "status.offline"
        }
    }
    var tone: StatusTone {
        switch self {
        case .online: .online
        case .busy: .busy
        case .offline: .offline
        }
    }
}

struct Expert: Identifiable, Hashable {
    enum AvatarTint { case lavender, peach }

    let id: String
    let name: String
    let shortName: String
    let initials: String
    var tint: AvatarTint
    let kind: ExpertKind
    let specialty: String
    let rating: Double
    let reviewCount: Int
    let languages: [String]
    /// Display string, e.g. "₹[A]/min". Pricing tiers are not final in the spec.
    let priceLabel: String
    var status: ExpertStatus

    var ratingText: String { String(format: "%.1f", rating) }
    var reviewCountText: String { reviewCount.formatted(.number.locale(Locale(identifier: "en_US"))) }
}

extension Expert {
    /// Sample data matching the design spec (prices are still spec placeholders).
    static let samples: [Expert] = [
        .init(id: "1", name: "Acharya Keshav", shortName: "Acharya K.", initials: "AK", tint: .lavender, kind: .astrologer,
              specialty: "Vedic Astrology", rating: 4.8, reviewCount: 1240, languages: ["English", "Hindi"],
              priceLabel: "₹[A]/min", status: .online),
        .init(id: "2", name: "Pt. Ramesh Gopal", shortName: "Pt. Ramesh G.", initials: "RG", tint: .lavender, kind: .astrologer,
              specialty: "Tarot Specialist", rating: 4.9, reviewCount: 2110, languages: ["English", "Hindi"],
              priceLabel: "₹[A]/min", status: .online),
        .init(id: "3", name: "Priya Sharma", shortName: "Priya Sharma", initials: "PS", tint: .peach, kind: .listener,
              specialty: "Listener", rating: 4.8, reviewCount: 640, languages: ["English", "Hindi"],
              priceLabel: "₹[A]/min", status: .online),
        .init(id: "4", name: "Sunita Mehra", shortName: "Sunita M.", initials: "SM", tint: .peach, kind: .astrologer,
              specialty: "Tarot Reader", rating: 4.7, reviewCount: 510, languages: ["English", "Hindi"],
              priceLabel: "₹[B]/min", status: .busy),
    ]
}
