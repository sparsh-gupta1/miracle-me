import Foundation
import SwiftUI

enum ConsultService: CaseIterable, Hashable {
    case chat, audio, video

    /// Label in the profile's rates table.
    var rateTitle: LocalizedStringKey {
        switch self {
        case .chat: "ep.rate.chat"
        case .audio: "ep.rate.audio"
        case .video: "ep.rate.video"
        }
    }
    /// Label on the session-sheet option tile.
    var optionTitle: LocalizedStringKey {
        switch self {
        case .chat: "service.chat"
        case .audio: "service.audio"
        case .video: "service.video"
        }
    }
    var startKey: LocalizedStringKey {
        switch self {
        case .chat: "session.start.chat"
        case .audio: "session.start.audio"
        case .video: "session.start.video"
        }
    }
}

struct ServiceRate: Hashable {
    let service: ConsultService
    /// Display string, e.g. "₹[A]/min" (pricing is still a spec placeholder).
    let price: String
}

struct ExpertReview: Hashable {
    let author: String
    let when: String
    let text: String
    var ratingText = ""
}

/// Everything the C-06 profile screen shows beyond the list-card `Expert`.
struct ExpertProfile: Identifiable, Hashable {
    var expert: Expert
    let headline: String
    let rates: [ServiceRate]
    let freeMinutesText: String
    var about = ""
    var specialities: [String] = []
    var review: ExpertReview?

    var id: String { expert.id }

    func price(for service: ConsultService) -> String? { rates.first { $0.service == service }?.price }
}

extension ExpertProfile {
    static let keshav = ExpertProfile(
        expert: Expert.samples[0],
        headline: "Vedic Astrologer & Kundli Specialist",
        rates: [.init(service: .chat, price: "₹[A]/min"), .init(service: .audio, price: "₹[B]/min"),
                .init(service: .video, price: "₹[C]/min")],
        freeMinutesText: "[X] min free",
        about: "Over 12 years of experience in Vedic Jyotish, Kundli matching, and Prashna charts. Dedicated to providing calm, authentic remedies for career and relationship crossroads.",
        specialities: ["Career", "Kundli Matching", "Vedic Remedies", "Prashna"],
        review: .init(author: "R.K.", when: "2 days ago",
                      text: "Very calm, insightful guidance on my job transition. Accurate analysis.", ratingText: "4.8"))

    static let ramesh: ExpertProfile = {
        var expert = Expert.samples[1]
        expert.status = .busy
        return ExpertProfile(
            expert: expert,
            headline: "Tarot & Numerology Specialist",
            rates: [.init(service: .chat, price: "₹[A]/min"), .init(service: .audio, price: "₹[B]/min")],
            freeMinutesText: "[X] min free",
            about: "Certified Tarot Master and Numerologist with deep practice in life guidance, career transitions, and decision clarity.",
            review: .init(author: "M.S.", when: "Yesterday",
                          text: "Direct answers and very uplifting consultation.", ratingText: "4.9"))
    }()

    /// Profile for a list-card expert. Only the two spec'd experts have full content.
    static func sample(for expert: Expert) -> ExpertProfile {
        switch expert.id {
        case "1": var p = keshav; p.expert.status = expert.status; return p
        case "2": var p = ramesh; p.expert.status = expert.status; return p
        default:
            return ExpertProfile(expert: expert, headline: expert.specialty,
                                 rates: [.init(service: .chat, price: expert.priceLabel), .init(service: .audio, price: expert.priceLabel)],
                                 freeMinutesText: "[X] min free")
        }
    }
}
