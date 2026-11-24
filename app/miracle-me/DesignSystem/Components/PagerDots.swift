import SwiftUI

struct PagerDots: View {
    let count: Int
    let current: Int

    var body: some View {
        HStack(spacing: Spacing.s2) {
            ForEach(0..<count, id: \.self) { index in
                Capsule()
                    .fill(index == current ? Color.brandSaffron : Color.brandBorder)
                    .frame(width: index == current ? 20 : 6, height: 6)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: current)
        .accessibilityElement()
        .accessibilityLabel("Page \(current + 1) of \(count)")
    }
}
