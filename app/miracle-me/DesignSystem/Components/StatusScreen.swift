import SwiftUI

/// Shared layout for full-screen status pages (offline, logged out, update…):
/// top bar · centered hero + title + body + info card · action stack.
struct StatusScreen<Bar: View, Hero: View, Info: View, Actions: View>: View {
    let title: LocalizedStringKey
    let message: LocalizedStringKey
    var messageMaxWidth: CGFloat = 270
    var heroSpacing: CGFloat = Spacing.s6
    var messageSpacing: CGFloat = Spacing.s6
    var actionSpacing: CGFloat = Spacing.s3
    @ViewBuilder var bar: Bar
    @ViewBuilder var hero: Hero
    @ViewBuilder var info: Info
    @ViewBuilder var actions: Actions

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) { bar }
                .frame(height: 64)
                .padding(.horizontal, Spacing.s6)
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                hero.padding(.bottom, heroSpacing)
                Text(title)
                    .textStyle(.sectionTitle)
                    .foregroundStyle(.brandIndigo)
                Text(message)
                    .textStyle(.bodyRelaxed)
                    .foregroundStyle(.textSecondary)
                    .frame(maxWidth: messageMaxWidth)
                    .padding(.top, Spacing.s2)
                    .padding(.bottom, messageSpacing)
                info.padding(.bottom, Spacing.s6)
                Spacer(minLength: 0)
            }
            .multilineTextAlignment(.center)
            .padding(.horizontal, Spacing.s6)
            VStack(spacing: actionSpacing) { actions }
                .padding(.horizontal, Spacing.s6)
                .padding(.bottom, Spacing.s6)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.brandBackground.ignoresSafeArea())
    }
}

/// Concentric-circle illustration used as the hero of status screens.
struct StatusHero<Glyph: View>: View {
    struct Border {
        var color: Color = .brandBorder
        var width: CGFloat = BorderWidth.hairline
        var dashed = false
    }

    var outerSize: CGFloat = 128
    var outerFill: Color = .brandIndigoTint
    var outerBorder: Border?
    var innerSize: CGFloat = 80
    var innerFill: Color = .brandBackground
    var innerBorder: Border?
    var showsAlertDot = false
    @ViewBuilder var glyph: Glyph

    var body: some View {
        ZStack {
            Circle().fill(outerFill)
                .overlay { ring(outerBorder) }
                .frame(width: outerSize, height: outerSize)
            Circle().fill(innerFill)
                .overlay { ring(innerBorder) }
                .frame(width: innerSize, height: innerSize)
            glyph
        }
        .frame(width: outerSize, height: outerSize)
        .overlay(alignment: .topTrailing) {
            if showsAlertDot {
                Circle().fill(Color.statusCritical)
                    .frame(width: 16, height: 16)
                    .overlay(Circle().strokeBorder(Color.surface, lineWidth: BorderWidth.strong))
                    .padding(Spacing.s3)
            }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder private func ring(_ border: Border?) -> some View {
        if let border {
            Circle().strokeBorder(border.color,
                                  style: StrokeStyle(lineWidth: border.width, dash: border.dashed ? [6, 6] : []))
        }
    }
}

/// Small round icon button (back / close) for status top bars.
struct RoundIconButton: View {
    let icon: AppIcon
    let label: LocalizedStringKey
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Icon(icon, size: 18)
                .foregroundStyle(.brandIndigo)
                .frame(width: 32, height: 32)
                .background(Color.brandIndigoTint, in: Circle())
        }
        .accessibilityLabel(label)
    }
}

/// Logo + wordmark. The wordmark is always Latin script.
struct BrandLockup: View {
    var iconSize: CGFloat = 22
    var style: TextStyle = .lockup

    var body: some View {
        HStack(spacing: Spacing.s1_5) {
            Icon(.logoMini, size: iconSize)
            Text(verbatim: "Miracle Me").textStyle(style, script: .latin).foregroundStyle(.brandIndigo)
        }
    }
}

/// Keeps a top-bar's center item balanced against a 32-pt round button.
struct StatusBarSlot: View {
    var body: some View { Color.clear.frame(width: 32, height: 32) }
}

/// Icon tile + title/detail card.
struct InfoRowCard: View {
    let icon: AppIcon
    let title: LocalizedStringKey
    let detail: LocalizedStringKey
    var tileForeground: Color = .statusOnlineText
    var tileBackground: Color = .statusOnlineBackground

    var body: some View {
        HStack(spacing: Spacing.s3) {
            IconTile(icon: icon, iconSize: 18, foreground: tileForeground, background: tileBackground)
            VStack(alignment: .leading, spacing: 0) {
                Text(title).textStyle(.xsSemibold).foregroundStyle(.textPrimary)
                Text(detail).textStyle(.micro).foregroundStyle(.textSecondary)
            }
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .surfaceCard()
    }
}
