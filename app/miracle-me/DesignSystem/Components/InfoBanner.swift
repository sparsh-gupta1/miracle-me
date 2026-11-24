import SwiftUI

struct InfoBanner: View {
    let text: LocalizedStringKey

    var body: some View {
        Callout(tone: .infoBordered, padding: Spacing.s3_5) {
            Icon(.info, size: 16)
                .foregroundStyle(.brandIndigo)
                .padding(.top, Spacing.s0_5)
            Text(text)
                .textStyle(.label)
                .foregroundStyle(.brandIndigo)
        }
    }
}
