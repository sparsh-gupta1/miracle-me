import Foundation

extension ConsultService {
    /// Name the REST quote endpoint uses.
    var apiName: String {
        switch self {
        case .chat: "chat"
        case .audio: "audio"
        case .video: "video"
        }
    }

    init?(apiName: String) {
        switch apiName {
        case "chat": self = .chat
        case "audio", "audio_call": self = .audio
        case "video", "video_call": self = .video
        default: return nil
        }
    }
}

enum PriceFormat {
    /// "₹10/min", "₹7.5/min".
    static func perMinute(_ rupees: Double) -> String { "₹\(amount(rupees))/min" }

    static func amount(_ rupees: Double) -> String {
        if rupees == rupees.rounded() { return String(Int(rupees)) }
        var text = String(format: "%.2f", rupees)
        if text.hasSuffix("0") { text.removeLast() }   // 7.50 → 7.5, 7.25 stays
        return text
    }
}

extension ExpertStatus {
    init(apiValue: String) {
        switch apiValue {
        case "online": self = .online
        case "busy": self = .busy
        default: self = .offline
        }
    }
}

extension Expert {
    init(dto: ExpertDTO) {
        let kind: ExpertKind = dto.role == "listener" ? .listener : .astrologer
        let words = dto.name.split(separator: " ").map(String.init)
        // Titles ("Pt.", "Dr.") don't count towards initials.
        let significant = words.filter { !$0.hasSuffix(".") }
        let initials = [significant.first, significant.count > 1 ? significant.last : nil]
            .compactMap { $0?.first.map { String($0).uppercased() } }.joined()
        var short = dto.name
        if words.count > 1, let last = words.last, let letter = last.first { short = words.dropLast().joined(separator: " ") + " \(letter)." }

        self.init(
            id: dto.id,
            name: dto.name,
            shortName: short,
            initials: initials.isEmpty ? "?" : initials,
            tint: kind == .astrologer ? .lavender : .peach,
            kind: kind,
            specialty: dto.specialty ?? (kind == .listener ? "Listener" : "Astrologer"),
            rating: dto.rating ?? 0,
            reviewCount: dto.reviewCount ?? 0,
            languages: dto.languages ?? [],
            priceLabel: dto.pricing?.chat.map(PriceFormat.perMinute) ?? "",
            status: ExpertStatus(apiValue: dto.status))
    }
}

extension ExpertProfile {
    /// Profile built from a list row only (no about / specialities / review yet).
    init(listing dto: ExpertDTO) {
        self.init(dto: dto, about: nil, specialities: nil, review: nil, freeMinutes: nil)
    }

    init(detail: ExpertDetailDTO) {
        self.init(dto: detail.expert, about: detail.about, specialities: detail.specialities,
                  review: detail.featuredReview, freeMinutes: detail.freeMinutes)
    }

    private init(dto: ExpertDTO, about: String?, specialities: [String]?, review: ReviewDTO?,
                 freeMinutes: ExpertDetailDTO.FreeMinutes?) {
        let pricing = dto.pricing
        let rates: [ServiceRate] = [
            pricing?.chat.map { ServiceRate(service: .chat, price: PriceFormat.perMinute($0)) },
            pricing?.audio.map { ServiceRate(service: .audio, price: PriceFormat.perMinute($0)) },
            pricing?.video.map { ServiceRate(service: .video, price: PriceFormat.perMinute($0)) },
        ].compactMap { $0 }
        let free = freeMinutes.map { max($0.chat, $0.audio, $0.video) } ?? 0
        self.init(expert: Expert(dto: dto),
                  headline: dto.headline ?? dto.specialty ?? "",
                  rates: rates,
                  freeMinutesText: free > 0 ? "\(free) min free" : "—",
                  about: about ?? "",
                  specialities: specialities ?? [],
                  review: review.map {
                      ExpertReview(author: $0.author, when: $0.when, text: $0.text,
                                   ratingText: $0.rating.map { String(format: "%.1f", $0) } ?? "")
                  })
    }
}

extension SessionQuote {
    init(dto: QuoteDTO) {
        self.init(freeMinutesText: dto.freeMinutes > 0 ? "\(dto.freeMinutes) min free" : "—",
                  balanceText: "₹\(PriceFormat.amount(dto.balance))",
                  talkTimeText: "\(dto.talkMinutes) minutes",
                  rechargeAmount: dto.hasSufficientBalance ? nil : String(dto.rechargeAmount))
    }
}
