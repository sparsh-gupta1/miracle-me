import Foundation

enum AppLanguage: String, CaseIterable, Identifiable {
    case english = "en"
    case hindi = "hi"

    var id: Self { self }
    var locale: Locale { Locale(identifier: rawValue) }
    var script: FontScript { FontScript(locale: locale) }
    var other: AppLanguage { self == .english ? .hindi : .english }

    // Language-intrinsic labels: always shown in the language itself.
    var nativeName: String { self == .english ? "English" : "हिंदी" }
    var appInLanguage: String { self == .english ? "App in English" : "ऐप हिंदी में" }
    var badgeGlyph: String { self == .english ? "A" : "अ" }
}
