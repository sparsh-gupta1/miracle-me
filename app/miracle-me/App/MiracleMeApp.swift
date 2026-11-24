import SwiftUI

@main
struct MiracleMeApp: App {
    init() { FontRegistry.registerAll() }

    var body: some Scene {
        WindowGroup { root }
    }

    @ViewBuilder private var root: some View {
        #if DEBUG
        if let screen = ScreenGallery.requested {
            screen().environment(\.locale, ScreenGallery.locale)
        } else {
            RootView()
        }
        #else
        RootView()
        #endif
    }
}
