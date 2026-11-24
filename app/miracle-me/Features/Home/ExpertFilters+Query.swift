import Foundation

/// Price bands behind the filter chips (₹ per minute, chat rate). Pricing tiers are still a spec
/// placeholder, so the thresholds live here in one place.
enum PriceBands {
    static let low = 10
    static let high = 20
}

extension ExpertFilters {
    /// Merges the filter sheet and the quick-filter chips into one server query.
    func query(text: String, quick: Set<SearchResultsView.QuickFilter>) -> ExpertQuery {
        var query = ExpertQuery()
        query.text = text.trimmingCharacters(in: .whitespaces)
        switch kind {
        case .astrologer?: query.kind = "astrologer"
        case .listener?: query.kind = "listener"
        case nil: break
        }
        query.onlineOnly = onlineOnly || quick.contains(.onlineNow)
        switch price {
        case .under?: query.maxPrice = PriceBands.low - 1
        case .mid?: query.minPrice = PriceBands.low; query.maxPrice = PriceBands.high
        case .high?: query.minPrice = PriceBands.high + 1
        case nil: if quick.contains(.underPrice) { query.maxPrice = PriceBands.low - 1 }
        }
        if rating == .fourPlus { query.minRating = 4 }
        switch gender {
        case .female?: query.gender = "female"
        case .male?: query.gender = "male"
        default: break
        }
        switch experience {
        case .oneToThree?: query.minExperience = 1; query.maxExperience = 3
        case .fivePlus?: query.minExperience = 5
        case .tenPlus?: query.minExperience = 10
        case nil: break
        }
        if quick.contains(.english) { query.language = "English" }
        return query
    }
}
