import Foundation

enum SignInMode { case customer, expert }

enum ExpertRole: CaseIterable, Identifiable {
    case astrologer, listener

    var id: Self { self }
    // Role names are shown in English with the Hindi term beneath, in every UI language.
    var title: String { self == .astrologer ? "Astrologer" : "Listener" }
    var hindiTitle: String { self == .astrologer ? "ज्योतिषी" : "लिसनर" }
}
