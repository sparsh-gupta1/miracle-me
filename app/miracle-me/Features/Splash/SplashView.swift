import SwiftUI

struct SplashView: View {
    var isSlowNetwork = false

    private var version: String {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        return "v\(v).0"
    }

    var body: some View {
        ScreenContainer {
            VStack(spacing: 0) {
                Color.clear.frame(height: Size.topBar)
                Spacer(minLength: 0)
                brand.padding(.top, -Spacing.s8)
                Spacer(minLength: 0)
                footer.footerInset()
            }
        }
    }

    private var brand: some View {
        VStack(spacing: 0) {
            BrandMark(variant: .splash).padding(.bottom, Spacing.s6)
            Text("Miracle Me")
                .textStyle(.display)
                .foregroundStyle(.brandIndigo)
            Text("splash.tagline")
                .textStyle(.tagline)
                .foregroundStyle(.textSecondary)
                .padding(.top, Spacing.s1)
        }
        .multilineTextAlignment(.center)
    }

    private var footer: some View {
        VStack(spacing: isSlowNetwork ? Spacing.s3 : Spacing.s4) {
            LoadingDots(pulsesAll: isSlowNetwork)
            if isSlowNetwork {
                StatusBadge(tone: .busy, title: "splash.connecting")
            }
            PrivacyNote().padding(.top, isSlowNetwork ? Spacing.s1 : 0)
            Text(verbatim: version)
                .textStyle(.version)
                .foregroundStyle(Color.textSecondary.opacity(0.7))
        }
    }
}

#Preview("English") { SplashView() }
#Preview("Hindi") { SplashView().environment(\.locale, AppLanguage.hindi.locale) }
#Preview("Slow network") { SplashView(isSlowNetwork: true) }
