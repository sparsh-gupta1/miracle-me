import SwiftUI

/// A-07 (state 1) — device is offline.
struct NoInternetView: View {
    let onBack: () -> Void
    let onRetry: () -> Void
    let onOpenSettings: () -> Void

    var body: some View {
        StatusScreen(title: "offline.title", message: "offline.body") {
            RoundIconButton(icon: .arrowLeft, label: "Back", action: onBack)
            Spacer(minLength: 0)
            Text(verbatim: "Miracle Me").textStyle(.xsMedium, script: .latin).foregroundStyle(.textSecondary)
            Spacer(minLength: 0)
            StatusBarSlot()
        } hero: {
            StatusHero(outerSize: 144, innerSize: 96,
                       innerBorder: .init(width: BorderWidth.strong, dashed: true),
                       showsAlertDot: true) {
                Icon(.wifiOff, size: 46).foregroundStyle(.brandIndigo)
            }
        } info: {
            InfoRowCard(icon: .shield, title: "offline.safe.title", detail: "offline.safe.body")
        } actions: {
            PrimaryButton(title: "offline.retry", icon: .rotate, radius: Radius.md, action: onRetry)
            TextButton(title: "offline.settings", action: onOpenSettings)
        }
    }
}

#Preview("English") { NoInternetView(onBack: {}, onRetry: {}, onOpenSettings: {}) }
#Preview("Hindi") {
    NoInternetView(onBack: {}, onRetry: {}, onOpenSettings: {}).environment(\.locale, AppLanguage.hindi.locale)
}
