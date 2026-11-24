import SwiftUI

/// Full-screen background with the standard 16-pt content inset.
struct ScreenContainer<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(Spacing.s4)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.brandBackground.ignoresSafeArea())
    }
}

extension View {
    /// Extra bottom inset under a screen's footer (button / status block).
    func footerInset(_ amount: CGFloat = Spacing.s6) -> some View {
        padding(.bottom, amount)
    }
}
