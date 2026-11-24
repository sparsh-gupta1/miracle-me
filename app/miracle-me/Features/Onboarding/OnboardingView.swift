import SwiftUI

struct OnboardingView: View {
    let onFinish: () -> Void
    @State private var index = 0

    private let slides = OnboardingSlide.all
    private var isLast: Bool { index == slides.count - 1 }

    var body: some View {
        ScreenContainer {
            VStack(spacing: 0) {
                skipBar
                TabView(selection: $index) {
                    ForEach(slides) { slide in
                        OnboardingSlideView(slide: slide).tag(slide.id)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                footer.footerInset()
            }
        }
        .animation(.easeInOut(duration: 0.25), value: index)
    }

    private var skipBar: some View {
        HStack {
            Spacer()
            Button(action: onFinish) {
                Text("action.skip")
                    .textStyle(.link)
                    .foregroundStyle(.brandIndigo)
                    .padding(.horizontal, Spacing.s2)
                    .padding(.vertical, Spacing.s1)
            }
        }
        .frame(height: Size.topBar - Spacing.s2)
        .padding(.top, Spacing.s2)
    }

    private var footer: some View {
        VStack(spacing: isLast ? Spacing.s4 : Spacing.s6) {
            PagerDots(count: slides.count, current: index)
            PrimaryButton(title: isLast ? "action.getStarted" : "action.next") {
                if isLast { onFinish() } else { index += 1 }
            }
            if isLast { PrivacyNote() }
        }
    }
}

private struct OnboardingSlideView: View {
    let slide: OnboardingSlide

    private let diameter: CGFloat = 240

    var body: some View {
        VStack(spacing: 0) {
            illustration.padding(.bottom, Spacing.s6)
            Text(slide.title)
                .textStyle(.heroTitle)
                .foregroundStyle(.brandIndigo)
                .fixedSize(horizontal: false, vertical: true)
            Text(slide.body)
                .textStyle(.body)
                .foregroundStyle(.textSecondary)
                .frame(maxWidth: 290)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.s2)
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, Spacing.s1)
        .padding(.top, -Spacing.s2)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var illustration: some View {
        ZStack {
            Circle().fill(Color.brandIndigoTint)
            if slide.showsSparkles { sparkles }
            Image(slide.illustration)
        }
        .frame(width: diameter, height: diameter)
        .overlay(Circle().strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
        .accessibilityHidden(true)
    }

    /// Positioned inside the 1-pt border: top 24 / right 32, bottom 32 / left 32.
    private var sparkles: some View {
        ZStack {
            Image("SparkleLarge").resizable().frame(width: 24, height: 24)
                .foregroundStyle(.brandSaffron)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .padding(.top, Spacing.s6).padding(.trailing, Spacing.s8)
            Image("SparkleSmall").resizable().frame(width: 16, height: 16)
                .foregroundStyle(Color.brandSaffron.opacity(0.7))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                .padding(.bottom, Spacing.s8).padding(.leading, Spacing.s8)
        }
        .padding(BorderWidth.hairline)
    }
}

#Preview("Slides") { OnboardingView(onFinish: {}) }
#Preview("Hindi") { OnboardingView(onFinish: {}).environment(\.locale, AppLanguage.hindi.locale) }
