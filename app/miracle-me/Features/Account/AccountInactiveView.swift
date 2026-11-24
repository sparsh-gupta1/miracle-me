import SwiftUI

/// A-08 (state 2) — account inactive or under review.
struct AccountInactiveView: View {
    let supportEmail: String
    let supportWhatsApp: String
    let onBack: () -> Void
    let onContactSupport: () -> Void
    let onBackToSignIn: () -> Void

    var body: some View {
        StatusScreen(title: "inactive.title", message: "inactive.body", messageMaxWidth: 280) {
            RoundIconButton(icon: .arrowLeft, label: "Back", action: onBack)
            Spacer(minLength: 0)
            TagChip(tone: .amberOutlined) { Text("inactive.chip") }
            Spacer(minLength: 0)
            StatusBarSlot()
        } hero: {
            StatusHero(outerFill: .amber50, outerBorder: .init(color: .amber200), innerFill: .surface) {
                Icon(.shieldAlert, size: 38).foregroundStyle(.statusBusyDot)
            }
        } info: {
            VStack(alignment: .leading, spacing: Spacing.s1) {
                Text("inactive.contact").textStyle(.xsSemibold).foregroundStyle(.textPrimary)
                contactRow(.mail) { Text(verbatim: supportEmail) }
                contactRow(.phoneCall) { RichText(key: "inactive.whatsapp", args: [supportWhatsApp]) }
            }
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .surfaceCard(padding: Spacing.s3_5)
        } actions: {
            PrimaryButton(title: "inactive.action", radius: Radius.md, action: onContactSupport)
            TextButton(title: "inactive.back", color: .textSecondary, action: onBackToSignIn)
        }
    }

    private func contactRow<Label: View>(_ icon: AppIcon, @ViewBuilder label: () -> Label) -> some View {
        HStack(spacing: Spacing.s2) {
            Icon(icon, size: 14)
            label().textStyle(.xsMedium)
        }
        .foregroundStyle(.brandIndigo)
    }
}

#Preview("Inactive") {
    AccountInactiveView(supportEmail: "support@miracleme.app", supportWhatsApp: "+91 98765 00000",
                        onBack: {}, onContactSupport: {}, onBackToSignIn: {})
}
