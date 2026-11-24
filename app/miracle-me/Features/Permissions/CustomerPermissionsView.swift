import SwiftUI

/// A-06a — customers are only asked for notifications up front.
struct CustomerPermissionsView: View {
    let onAllow: () -> Void
    let onSkip: () -> Void

    var body: some View {
        ScreenContainer {
            VStack(spacing: 0) {
                VStack(spacing: 0) {
                    TopBar(bottomPadding: Spacing.s2) {
                        SunMarkBadge(diameter: 32)
                    } trailing: {
                        Button(action: onSkip) {
                            Text("action.skip").textStyle(.smMedium).foregroundStyle(.textSecondary)
                        }
                    }
                    hero.padding(.top, Spacing.s4)
                    VStack(spacing: Spacing.s3) {
                        FeatureCard(title: "perm.customer.live.title", detail: "perm.customer.live.body")
                        FeatureCard(title: "perm.customer.wallet.title", detail: "perm.customer.wallet.body")
                    }
                    .padding(.top, Spacing.s6)
                    Callout(alignment: .center) {
                        Text("🛡️").textStyle(.bodyDefault)
                        Text("perm.customer.reassure").textStyle(.micro).foregroundStyle(.brandIndigo)
                    }
                    .padding(.top, Spacing.s4)
                }
                Spacer(minLength: 0)
                VStack(spacing: Spacing.s2) {
                    PrimaryButton(title: "perm.allowNotifications", action: onAllow)
                    TextButton(title: "perm.later", style: .smMedium, color: .textSecondary, action: onSkip)
                }
                .footerInset(Spacing.s4)
            }
        }
    }

    private var hero: some View {
        VStack(spacing: 0) {
            Icon(.bell, size: 48)
                .foregroundStyle(.brandIndigo)
                .frame(width: 96, height: 96)
                .background(Color.brandIndigoTint, in: Circle())
                .padding(.bottom, Spacing.s4)
            Text("perm.customer.title").textStyle(.sectionTitle).foregroundStyle(.brandIndigo)
            Text("perm.customer.body")
                .textStyle(.smSnug)
                .foregroundStyle(.textSecondary)
                .padding(.top, Spacing.s1_5)
                .padding(.horizontal, Spacing.s4)
        }
        .multilineTextAlignment(.center)
    }
}

private struct FeatureCard: View {
    let title: LocalizedStringKey
    let detail: LocalizedStringKey

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.s3) {
            Icon(.check, size: 16)
                .foregroundStyle(.statusOnlineText)
                .frame(width: 32, height: 32)
                .background(Color.statusOnlineBackground, in: Circle())
                .padding(.top, Spacing.s0_5)
            VStack(alignment: .leading, spacing: 0) {
                Text(title).textStyle(.smBold).foregroundStyle(.textPrimary)
                Text(detail).textStyle(.micro).foregroundStyle(.textSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .surfaceCard(radius: Radius.lg, padding: Spacing.s3_5)
    }
}

#Preview("English") { CustomerPermissionsView(onAllow: {}, onSkip: {}) }
#Preview("Hindi") { CustomerPermissionsView(onAllow: {}, onSkip: {}).environment(\.locale, AppLanguage.hindi.locale) }
