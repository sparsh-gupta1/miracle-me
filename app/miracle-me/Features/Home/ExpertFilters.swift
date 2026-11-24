import SwiftUI

/// Filter selections edited in the C-05 sheet. `nil` / `false` means "not filtering".
struct ExpertFilters: Hashable {
    enum PriceTier { case under, mid, high }
    enum Rating { case fourPlus, all }
    enum GenderPreference { case any, female, male }
    enum Experience { case oneToThree, fivePlus, tenPlus }

    var kind: ExpertKind?
    var onlineOnly = false
    var price: PriceTier?
    var rating: Rating?
    var gender: GenderPreference?
    var experience: Experience?
}
