import SwiftUI

/// Debug gallery entries for this group. Launch one with: `-galleryScreen <key>`.
enum ExpertGalleryG13 {
    /// Stand-in for the tab shell's bottom navigation (owned by the shell fork).
    private struct BottomBarPlaceholder: View {
        var body: some View {
            Color.surface.frame(height: 64)
                .overlay(alignment: .top) { Rectangle().fill(Color.g13Border).frame(height: 1) }
                .shadow(color: Color(hex: 0x2A1B4E, opacity: 0.06), radius: 8, y: -4)
        }
    }

    @MainActor static let screens: [String: () -> AnyView] = [
        "e16": { AnyView(ExpertProfileEditView(profile: .sample, bottomBar: { BottomBarPlaceholder() })) },
        "e17": { AnyView(ExpertSettingsView(settings: .sample)) },
        "e18": { AnyView(ExpertDocumentsView(documents: .sample)) },
    ]
}
