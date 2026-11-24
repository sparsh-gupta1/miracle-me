import SwiftUI

/// Three saffron dots. The first always pulses; `pulsesAll` pulses every dot (slow-network state).
struct LoadingDots: View {
    var pulsesAll = false
    @State private var dimmed = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let levels: [Double] = [1, 0.6, 0.3]

    var body: some View {
        HStack(spacing: Spacing.s1_5) {
            ForEach(levels.indices, id: \.self) { index in
                let pulses = pulsesAll || index == 0
                Circle()
                    .fill(Color.brandSaffron.opacity(pulsesAll ? 1 : levels[index]))
                    .frame(width: 10, height: 10)
                    .opacity(pulses && dimmed ? 0.5 : 1)
            }
        }
        .frame(height: Spacing.s6)
        .onAppear {
            guard !reduceMotion else { return }
            // Tailwind animate-pulse: 2 s cycle, opacity 1 → .5 → 1.
            withAnimation(.timingCurve(0.4, 0, 0.6, 1, duration: 1).repeatForever(autoreverses: true)) {
                dimmed = true
            }
        }
    }
}
