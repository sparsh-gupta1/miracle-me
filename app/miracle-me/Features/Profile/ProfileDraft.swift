import Foundation
import Observation

enum Gender: CaseIterable { case male, female, other }

enum BirthTimePeriod: CaseIterable { case morning, afternoon, evening, night }

/// Onboarding answers collected on C-01 and C-02.
@Observable
final class ProfileDraft {
    var name = ""
    var gender: Gender?
    var dateOfBirth: Date?

    var birthDate: Date?
    var birthTime: Date?
    var doesNotKnowBirthTime = false
    var approximatePeriod: BirthTimePeriod = .morning
    var birthPlace = ""
    var sharesWithAstrologers = true
}
