import SwiftUI

/// Top row with leading / center / trailing slots, spaced like CSS `justify-between`.
struct TopBar<Center: View, Trailing: View>: View {
    var bottomPadding: CGFloat = Spacing.s4
    var onBack: (() -> Void)?
    @ViewBuilder var center: Center
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 0) {
            Group {
                if let onBack { BackButton(action: onBack) } else { TopBarSlot() }
            }
            .frame(width: Size.topBar, height: Size.topBar)
            Spacer(minLength: 0)
            center
            Spacer(minLength: 0)
            trailing
        }
        .padding(.top, Spacing.s2)
        .padding(.bottom, bottomPadding)
    }
}

/// Empty 40-pt slot that keeps the center item balanced.
struct TopBarSlot: View {
    var body: some View { Color.clear.frame(width: Size.topBar, height: Size.topBar) }
}

extension TopBar where Trailing == TopBarSlot {
    init(bottomPadding: CGFloat = Spacing.s4, onBack: (() -> Void)? = nil, @ViewBuilder center: () -> Center) {
        self.init(bottomPadding: bottomPadding, onBack: onBack, center: center, trailing: { TopBarSlot() })
    }
}

struct BackButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Icon(.chevronLeft, size: 20)
                .foregroundStyle(.brandIndigo)
                .frame(width: Size.topBar, height: Size.topBar)
        }
        .accessibilityLabel("Back")
    }
}

/// Small round logo used in top bars.
struct SunMarkBadge: View {
    let diameter: CGFloat

    var body: some View {
        Icon(.sunMark, size: 20)
            .frame(width: diameter, height: diameter)
            .background(Color.brandBackground, in: Circle())
    }
}
