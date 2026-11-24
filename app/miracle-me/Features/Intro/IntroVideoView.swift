import SwiftUI

/// C-03 — welcome video card and benefit list.
struct IntroVideoView: View {
    let onPlay: () -> Void
    let onGoHome: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Text("intro.eyebrow").textStyle(.eyebrow).textCase(.uppercase).foregroundStyle(.brandSaffron)
                    .padding(.bottom, Spacing.s1)
                Text("intro.title").textStyle(.screenHeading).foregroundStyle(.brandIndigo)
                    .padding(.bottom, Spacing.s5)
                videoCard.padding(.bottom, Spacing.s6)
                VStack(alignment: .leading, spacing: Spacing.s3_5) {
                    BenefitRow(title: "intro.benefit.talk")
                    BenefitRow(title: "privacy.note")
                    BenefitRow(title: "intro.benefit.pricing")
                }
            }
            Spacer(minLength: 0)
            PrimaryButton(title: "intro.goHome", radius: Radius.md, textStyle: .compactButton, action: onGoHome)
                .padding(.top, Spacing.s4)
        }
        .padding(Spacing.s6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.brandBackground.ignoresSafeArea())
    }

    private var videoCard: some View {
        Button(action: onPlay) {
            VStack(spacing: 0) {
                Icon(.play, size: 24)
                    .foregroundStyle(.brandIndigo)
                    .padding(.leading, Spacing.s1)
                    .frame(width: 56, height: 56)
                    .background(Color.brandSaffron, in: Circle())
                    .shadow(color: .black.opacity(0.1), radius: 3, y: 4)
                    .padding(.bottom, Spacing.s2)
                Text("intro.watch").textStyle(.xsBold).foregroundStyle(.brandIndigo)
                Text("intro.tap").textStyle(.nano).foregroundStyle(.textMuted).padding(.top, Spacing.s0_5)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 176)
            .background(Color.brandIndigoTint, in: RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(RoundedRectangle(cornerRadius: Radius.xl).strokeBorder(Color.borderVideo, lineWidth: BorderWidth.hairline))
            .elevationSm()
        }
        .buttonStyle(.plain)
    }
}

private struct BenefitRow: View {
    let title: LocalizedStringKey

    var body: some View {
        HStack(spacing: Spacing.s3) {
            Icon(.checkBold, size: 14)
                .foregroundStyle(.statusOnlineText)
                .frame(width: 24, height: 24)
                .background(Color.statusOnlineBackground, in: Circle())
            Text(title).textStyle(.xsSemibold).foregroundStyle(.brandIndigo)
        }
    }
}

#Preview("Intro") { IntroVideoView(onPlay: {}, onGoHome: {}) }
