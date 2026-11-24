import SwiftUI

/// A-07 (state 3) — backend unavailable.
struct ServerErrorView: View {
    let errorCode: String
    let onBack: () -> Void
    let onRetry: () -> Void
    let onOpenHelp: () -> Void
    let onContactWhatsApp: () -> Void

    var body: some View {
        StatusScreen(title: "server.title", message: "server.body") {
            RoundIconButton(icon: .arrowLeft, label: "Back", action: onBack)
            Spacer(minLength: 0)
            TagChip(tone: .amber) { RichText(key: "server.code", args: [errorCode]) }
            Spacer(minLength: 0)
            StatusBarSlot()
        } hero: {
            StatusHero(outerSize: 144, outerFill: .brandSaffronTint, innerSize: 96,
                       innerBorder: .init(width: BorderWidth.strong)) {
                Icon(.serverError, size: 44)
            }
        } info: {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                HStack {
                    HStack(spacing: Spacing.s1_5) {
                        Icon(.infoSmall, size: 14).foregroundStyle(.brandIndigo)
                        Text("server.help.title")
                    }
                    .textStyle(.xsSemibold)
                    .foregroundStyle(.textPrimary)
                    Spacer(minLength: Spacing.s2)
                    Button(action: onOpenHelp) {
                        Text("server.help.link").textStyle(.microMedium).foregroundStyle(.brandSaffron)
                    }
                }
                Text("server.help.body").textStyle(.micro).foregroundStyle(.textSecondary)
            }
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .surfaceCard()
        } actions: {
            PrimaryButton(title: "server.retry", icon: .rotate, radius: Radius.md, action: onRetry)
            TextButton(title: "server.whatsapp", action: onContactWhatsApp)
        }
    }
}

#Preview("Server error") {
    ServerErrorView(errorCode: "503", onBack: {}, onRetry: {}, onOpenHelp: {}, onContactWhatsApp: {})
}
