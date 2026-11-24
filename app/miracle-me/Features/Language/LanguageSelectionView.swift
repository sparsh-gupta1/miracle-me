import SwiftUI

struct LanguageSelectionView: View {
    @Binding var selection: AppLanguage
    let onContinue: () -> Void

    var body: some View {
        ScreenContainer {
            VStack(spacing: 0) {
                VStack(spacing: 0) {
                    BrandMark(variant: .compact).padding(.top, Spacing.s6)
                    header.padding(.top, Spacing.s8)
                    cards.padding(.top, Spacing.s8)
                    InfoBanner(text: "language.banner").padding(.top, Spacing.s6)
                }
                Spacer(minLength: 0)
                PrimaryButton(title: "action.continue", action: onContinue).footerInset()
            }
        }
    }

    private var header: some View {
        VStack(spacing: 0) {
            Text("language.title")
                .textStyle(.screenTitle)
                .foregroundStyle(.brandIndigo)
            // Same prompt in the other language, set in that language's typeface.
            Text("language.title")
                .environment(\.locale, selection.other.locale)
                .textStyle(.screenSubtitle, script: selection.other.script)
                .foregroundStyle(Color.brandIndigo.opacity(0.8))
                .padding(.top, Spacing.s0_5)
            Text("language.hint")
                .textStyle(.hint)
                .foregroundStyle(.textSecondary)
                .padding(.top, Spacing.s2)
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, Spacing.s2)
    }

    private var cards: some View {
        VStack(spacing: Spacing.s3) {
            ForEach(AppLanguage.allCases) { language in
                LanguageOptionCard(language: language, isSelected: language == selection) {
                    selection = language
                }
            }
        }
    }
}

#Preview("English selected") {
    LanguageSelectionView(selection: .constant(.english), onContinue: {})
}
#Preview("Hindi selected") {
    LanguageSelectionView(selection: .constant(.hindi), onContinue: {})
        .environment(\.locale, AppLanguage.hindi.locale)
}
