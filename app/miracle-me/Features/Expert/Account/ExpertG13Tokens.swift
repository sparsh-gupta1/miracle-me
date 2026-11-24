import SwiftUI

// MARK: Colours (expert-screen palette: the mock's Material-style neutrals)

extension Color {
    static var g13OnSurface: Color { Color(hex: 0x1B1C1A) }
    static var g13OnSurfaceVariant: Color { Color(hex: 0x49454F) }
    static var g13Outline: Color { Color(hex: 0x7A7580) }
    static var g13Primary: Color { Color(hex: 0x140338) }
    static var g13OnPrimaryContainer: Color { Color(hex: 0x9483BD) }
    static var g13Secondary: Color { Color(hex: 0x8B5000) }
    static var g13SecondaryFixed: Color { Color(hex: 0xFFDCBE) }
    static var g13OnSecondaryContainer: Color { Color(hex: 0x6A3C00) }
    static var g13SurfaceContainer: Color { Color(hex: 0xEFEEEB) }
    static var g13SurfaceContainerLow: Color { Color(hex: 0xF5F3F0) }
    static var g13SurfaceContainerHigh: Color { Color(hex: 0xEAE8E5) }
    static var g13SurfaceVariant: Color { Color(hex: 0xE4E2DF) }
    static var g13TertiaryContainer: Color { Color(hex: 0x002C0E) }
    static var g13TertiaryFixedDim: Color { Color(hex: 0x62DF7D) }
    static var g13Border: Color { Color(hex: 0xE7E3DC) }
}

// MARK: Typography (Tailwind sizes from the mock, set in the app typeface)

private func g13Style(_ size: CGFloat, _ lineHeight: CGFloat, _ weight: FontWeight = .regular,
                      tracking: CGFloat = 0, monospaced: Bool = false) -> TextStyle {
    TextStyle(.init(size: size, lineHeight: lineHeight, weight: weight, tracking: tracking, monospaced: monospaced))
}

extension TextStyle {
    static let g13Title = g13Style(20, 28, .bold, tracking: -0.005)
    static let g13SubheadBold = g13Style(16, 24, .bold)
    static let g13Subhead = g13Style(16, 24, .semibold)
    static let g13Subhead13Bold = g13Style(13, 24, .bold)
    static let g13Subhead13Semibold = g13Style(13, 24, .semibold)
    static let g13Body = g13Style(14, 22)
    static let g13BodyMedium = g13Style(14, 22, .medium)
    static let g13Body13 = g13Style(13, 22)
    static let g13Body13Medium = g13Style(13, 22, .medium)
    static let g13Body13Relaxed = g13Style(13, 21.125)
    static let g13Caption = g13Style(12, 18, tracking: 0.01)
    static let g13CaptionMedium = g13Style(12, 18, .medium, tracking: 0.01)
    static let g13CaptionSemibold = g13Style(12, 18, .semibold, tracking: 0.01)
    static let g13CaptionBold = g13Style(12, 18, .bold, tracking: 0.01)
    static let g13CaptionRelaxed = g13Style(12, 19.5, tracking: 0.01)
    static let g13CaptionRelaxedMedium = g13Style(12, 19.5, .medium, tracking: 0.01)
    static let g13CaptionCaps = g13Style(12, 18, .semibold, tracking: 0.05)
    static let g13CaptionMono = g13Style(12, 18, .bold, tracking: 0.05, monospaced: true)
    static let g13Caption11 = g13Style(11, 18, tracking: 0.01)
    static let g13Caption10 = g13Style(10, 18, tracking: 0.01)
    static let g13Caption11Semibold = g13Style(11, 18, .semibold, tracking: 0.01)
    /// Pill labels: 11 pt on the page's inherited 22 pt line.
    static let g13Pill = g13Style(11, 22, .semibold)
}

// MARK: Pieces

/// New expert-screen icon (template image). Existing icons use `Icon`.
struct G13Icon: View {
    let name: String
    let size: CGFloat

    init(_ name: String, size: CGFloat) {
        self.name = name
        self.size = size
    }

    var body: some View {
        Image(name).resizable().frame(width: size, height: size).accessibilityHidden(true)
    }
}

/// 56-pt app bar with back button, title and optional trailing action. `shadow-sm` underneath.
struct G13AppBar<Trailing: View>: View {
    let title: LocalizedStringKey
    let onBack: () -> Void
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: Spacing.s3) {
            Button(action: onBack) {
                Icon(.arrowLeft, size: 20).foregroundStyle(Color.g13Primary).frame(width: 36, height: 36)
            }
            .accessibilityLabel("Back")
            Text(title).textStyle(.g13SubheadBold).foregroundStyle(Color.g13Primary)
            Spacer(minLength: 0)
            trailing
        }
        .padding(.horizontal, Spacing.s4)
        .frame(height: 56)
        .background(Color.brandBackground)
        .shadow(color: .black.opacity(0.05), radius: 1, y: 1)
        .zIndex(1)
    }
}

extension G13AppBar where Trailing == EmptyView {
    init(title: LocalizedStringKey, onBack: @escaping () -> Void) {
        self.init(title: title, onBack: onBack, trailing: { EmptyView() })
    }
}

extension View {
    /// White card used across the expert account screens: `rounded-xl`, `#E7E3DC` border, `shadow-sm`.
    func g13Card(padding: CGFloat = 0, radius: CGFloat = Radius.md, fill: Color = .surface, shadow: Bool = true) -> some View {
        self.padding(padding)
            .background(fill, in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(Color.g13Border, lineWidth: BorderWidth.hairline))
            .shadow(color: .black.opacity(shadow ? 0.05 : 0), radius: 1, y: 1)
    }
}

/// 1-pt `#E7E3DC` divider.
struct G13Divider: View {
    var body: some View { Rectangle().fill(Color.g13Border).frame(height: 1) }
}

/// 40 × 24 toggle: green when on, `surface-variant` when off, 20-pt white thumb.
struct G13Switch: View {
    @Binding var isOn: Bool

    var body: some View {
        Button { withAnimation(.easeInOut(duration: 0.15)) { isOn.toggle() } } label: {
            Capsule()
                .fill(isOn ? Color.statusOnlineDot : Color.g13SurfaceVariant)
                .frame(width: 40, height: 24)
                .overlay(alignment: isOn ? .trailing : .leading) {
                    Circle().fill(Color.white).frame(width: 20, height: 20)
                        .shadow(color: .black.opacity(0.1), radius: 3, y: 4)
                        .padding(2)
                }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(.isButton)
        .accessibilityValue(isOn ? "On" : "Off")
    }
}

/// Full-width 14-pt-radius saffron button with white label.
struct G13SaffronButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity).frame(height: 48)
            .background(configuration.isPressed ? Color.brandSaffronPressed : Color.brandSaffron,
                        in: RoundedRectangle(cornerRadius: Radius.lg))
            .shadow(color: .black.opacity(0.1), radius: 3, y: 4)
    }
}

/// Status pill: icon + label on a tinted capsule.
struct G13StatusPill: View {
    enum Tone { case verified, review }
    let tone: Tone
    let title: LocalizedStringKey
    let icon: AppIcon

    var body: some View {
        HStack(spacing: Spacing.s1) {
            Icon(icon, size: 12)
            Text(title).textStyle(.g13Pill)
        }
        .foregroundStyle(tone == .verified ? Color.statusOnlineDot : Color.g13OnSecondaryContainer)
        .padding(.horizontal, Spacing.s2)
        .padding(.vertical, Spacing.s0_5)
        .background(tone == .verified ? Color.g13TertiaryContainer : Color.g13SecondaryFixed, in: Capsule())
    }
}
