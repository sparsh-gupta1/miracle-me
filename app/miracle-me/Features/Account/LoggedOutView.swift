import SwiftUI

/// A-08 (state 1) — session expired or signed in elsewhere.
struct LoggedOutView: View {
    let onLogIn: () -> Void

    var body: some View {
        StatusScreen(title: "loggedOut.title", message: "loggedOut.body") {
            Spacer(minLength: 0)
            BrandLockup()
            Spacer(minLength: 0)
        } hero: {
            StatusHero(innerBorder: .init()) {
                Icon(.login, size: 40).foregroundStyle(.brandIndigo)
            }
        } info: {
            InfoRowCard(icon: .lock, title: "loggedOut.safe.title", detail: "loggedOut.safe.body",
                        tileForeground: .brandIndigo, tileBackground: .brandIndigoTint)
        } actions: {
            PrimaryButton(title: "loggedOut.action", radius: Radius.md, action: onLogIn)
            (Text("🔒 ") + Text("privacy.note")).textStyle(.xs).foregroundStyle(.textSecondary)
        }
    }
}

#Preview("English") { LoggedOutView(onLogIn: {}) }
#Preview("Hindi") { LoggedOutView(onLogIn: {}).environment(\.locale, AppLanguage.hindi.locale) }
