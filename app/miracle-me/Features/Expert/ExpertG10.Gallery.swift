import SwiftUI

/// Debug gallery entries for this group. Launch one with: `-galleryScreen <key>`.
enum ExpertGalleryG10 {
    @MainActor static let screens: [String: () -> AnyView] = [
        "e01-offline": { AnyView(GalleryShell(home: ExpertHomeView(isOnline: false))) },
        "e01-online": { AnyView(GalleryShell(home: ExpertHomeView(isOnline: true))) },
        "e02": {
            AnyView(ZStack {
                Color.brandBackground.ignoresSafeArea()
                ExpertIncomingRequestView()
            })
        },
        "e03": { AnyView(ExpertActiveChatView()) },
        "e04": { AnyView(ExpertActiveCallView()) },
        "e05": { AnyView(ExpertSessionRecapView()) },
    ]

    private struct GalleryShell: View {
        let home: ExpertHomeView
        @State private var tab = ExpertTab.home
        var body: some View { ExpertTabShell(selection: $tab) { home } }
    }
}
