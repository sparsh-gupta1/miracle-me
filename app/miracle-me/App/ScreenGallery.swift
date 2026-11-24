import SwiftUI

#if DEBUG
/// Launches a single screen full-screen for visual comparison: `-galleryScreen e01-online [-galleryLang hi]`.
@MainActor
enum ScreenGallery {
    static var all: [String: () -> AnyView] {
        ExpertGalleryG10.screens
            .merging(ExpertGalleryG11.screens) { a, _ in a }
            .merging(ExpertGalleryG12.screens) { a, _ in a }
            .merging(ExpertGalleryG13.screens) { a, _ in a }
    }

    static var requested: (() -> AnyView)? {
        UserDefaults.standard.string(forKey: "galleryScreen").flatMap { all[$0] }
    }

    static var locale: Locale {
        UserDefaults.standard.string(forKey: "galleryLang") == "hi" ? AppLanguage.hindi.locale : AppLanguage.english.locale
    }
}
#endif
