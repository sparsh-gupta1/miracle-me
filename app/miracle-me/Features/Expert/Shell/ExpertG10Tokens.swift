import SwiftUI

// MARK: Colours (Material-style tokens used by the expert mock that the customer app doesn't define)

extension ShapeStyle where Self == Color {
    static var g10Ink: Color { Color(hex: 0x140338) }            // primary
    static var g10OnSurface: Color { Color(hex: 0x1B1C1A) }
    static var g10OnSurfaceVariant: Color { Color(hex: 0x49454F) }
    static var g10Inactive: Color { Color(hex: 0x7A7580) }
    static var g10Divider: Color { Color(hex: 0xF0ECE6) }
    static var g10Amber: Color { Color(hex: 0x8B5000) }
    static var g10AmberTint: Color { Color(hex: 0xFFF4E5) }
    static var g10AmberBorder: Color { Color(hex: 0xFFE2BD) }
    static var g10TipBackground: Color { Color(hex: 0xFFF9F2) }
    static var g10TipBorder: Color { Color(hex: 0xFFE7C8) }
    static var g10TipText: Color { Color(hex: 0x6A3C00) }
    static var g10ToggleOff: Color { Color(hex: 0xE2DED8) }
    static var g10GreenDark: Color { Color(hex: 0x166534) }
    static var g10GreenBorder: Color { Color(hex: 0x86EFAC) }
    static var g10GreenSoft: Color { Color(hex: 0xDCFCE7) }
    static var g10GreenPale: Color { Color(hex: 0xF0FDF4) }
    static var g10GreenOutline: Color { Color(hex: 0xBBF7D0) }
    static var g10EmeraldBorder: Color { Color(hex: 0xA7F3D0) }
    static var g10GreenPressed: Color { Color(hex: 0x15803D) }
    static var g10RedTint: Color { Color(hex: 0xFEE2E2) }
    static var g10Scrim: Color { Color(hex: 0x1E1B26, opacity: 0.6) }
    static var g10Grab: Color { Color(hex: 0xE4E2DF) }
    static var g10LavenderLine: Color { Color(hex: 0xE9E4F0) }
    static var g10LavenderBorder: Color { Color(hex: 0xD9D0E7) }
}

// MARK: Typography (sizes from the mock's Tailwind classes; Poppins like the rest of the app)

extension TextStyle {
    static func g10(_ size: CGFloat, _ line: CGFloat, _ weight: FontWeight = .regular, tracking: CGFloat = 0) -> TextStyle {
        TextStyle(latin: .init(size: size, lineHeight: line, weight: weight, tracking: tracking))
    }
    // text-caption 12/18, tracking .01em
    static let g10Caption = g10(12, 18, tracking: 0.01)
    static let g10CaptionMedium = g10(12, 18, .medium, tracking: 0.01)
    static let g10CaptionSemibold = g10(12, 18, .semibold, tracking: 0.01)
    static let g10CaptionBold = g10(12, 18, .bold, tracking: 0.01)
    static let g10CaptionRelaxed = g10(12, 19.5)
    // text-subhead 16/24
    static let g10Subhead = g10(16, 24, .semibold)
    static let g10SubheadBold = g10(16, 24, .bold)
    static let g10SubheadTight = g10(16, 24, .bold, tracking: -0.025)
    // text-body 13
    static let g10Body13 = g10(13, 21)
    static let g10Body13Bold = g10(13, 20, .bold)
    static let g10Body13Semibold = g10(13, 20, .semibold)
    static let g10Italic13 = g10(13, 22)
    // 14
    static let g10Text14Semibold = g10(14, 20, .semibold)
    static let g10Text14Bold = g10(14, 20, .bold)
    static let g10Text14Medium = g10(14, 20, .medium)
    // titles
    static let g10Title16Bold = g10(16, 22, .bold)
    static let g10Title18Bold = g10(18, 26, .bold)
    static let g10Title20Bold = g10(20, 28, .bold)
    static let g10Title22Bold = g10(22, 30, .bold)
    static let g10Display24 = g10(24, 32, .bold, tracking: -0.01)
    // 11 / 10 / 9
    static let g10Text11 = g10(11, 15)
    static let g10Text11Medium = g10(11, 15, .medium)
    static let g10Text11Semibold = g10(11, 15, .semibold)
    static let g10Text11Bold = g10(11, 15, .bold)
    static let g10Text11Caps = g10(11, 15, .bold, tracking: 0.05)
    static let g10Text10 = g10(10, 14)
    static let g10Text10Medium = g10(10, 14, .medium)
    static let g10Text10Semibold = g10(10, 14, .semibold)
    static let g10Badge = g10(10, 14, .semibold, tracking: 0.05)
    static let g10Badge9 = g10(9, 13, .semibold)
    static let g10Text12Semibold = g10(12, 16, .semibold)
    static let g10Text12Bold = g10(12, 16, .bold)
}

// MARK: Building blocks

/// Icon from a G10 imageset (template rendering), tinted with `.foregroundStyle`.
struct G10Icon: View {
    let name: String
    let size: CGFloat
    init(_ name: String, size: CGFloat) { self.name = name; self.size = size }

    var body: some View {
        Image(name).resizable().frame(width: size, height: size).accessibilityHidden(true)
    }
}

/// 48×28 switch from the availability card.
struct G10Toggle: View {
    @Binding var isOn: Bool
    var onColor: Color = .statusOnlineDot

    var body: some View {
        Button { withAnimation(.easeInOut(duration: 0.2)) { isOn.toggle() } } label: {
            Capsule()
                .fill(isOn ? onColor : Color.g10ToggleOff)
                .frame(width: 48, height: 28)
                .overlay(alignment: isOn ? .trailing : .leading) {
                    Circle().fill(Color.white).frame(width: 20, height: 20)
                        .shadow(color: .black.opacity(0.1), radius: 3, y: 2)
                        .padding(4)
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isOn ? "Online" : "Offline")
        .accessibilityAddTraits(.isToggle)
    }
}

extension View {
    /// White card used across the expert screens: rounded, hairline border, optional fill/border override.
    func g10Card(radius: CGFloat = Radius.xl, padding: CGFloat = Spacing.s4, fill: Color = .surface,
                 border: Color = .brandBorder, shadow: Bool = true) -> some View {
        self.padding(padding)
            .background(fill, in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(border, lineWidth: BorderWidth.hairline))
            .shadow(color: .black.opacity(shadow ? 0.05 : 0), radius: 1, y: 1)
    }

    /// Hairline rule on one edge.
    func g10Rule(_ edge: Alignment, color: Color = .brandBorder) -> some View {
        overlay(alignment: edge) {
            Rectangle().fill(color).frame(
                width: (edge == .leading || edge == .trailing) ? BorderWidth.hairline : nil,
                height: (edge == .top || edge == .bottom) ? BorderWidth.hairline : nil)
        }
    }
}

/// Initials circle used for the expert and customer avatars.
struct G10Avatar: View {
    let initials: String
    var size: CGFloat = 36
    var fill: Color = .brandIndigo
    var foreground: Color = .white
    var style: TextStyle = .g10Title16Bold
    var shadow = true

    var body: some View {
        Text(verbatim: initials).textStyle(style).foregroundStyle(foreground)
            .frame(width: size, height: size)
            .background(fill, in: Circle())
            .shadow(color: .black.opacity(shadow ? 0.05 : 0), radius: 1, y: 1)
    }
}

/// Dot that pulses outward (Tailwind `animate-ping`).
struct G10PingDot: View {
    let size: CGFloat
    var color: Color = .statusOnlineDot
    var showsRing = true
    @State private var pinging = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            if showsRing {
                Circle().fill(color).opacity(pinging ? 0 : 0.75).scaleEffect(pinging ? 2 : 1)
            }
            Circle().fill(color)
        }
        .frame(width: size, height: size)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeOut(duration: 1).repeatForever(autoreverses: false)) { pinging = true }
        }
    }
}

/// 64-pt white app bar with a bottom hairline; extends under the status bar.
struct G10AppBar<Content: View>: View {
    var horizontal: CGFloat = Spacing.s4
    var shadow = false
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(.horizontal, horizontal)
            .frame(height: 64)
            .frame(maxWidth: .infinity)
            .background(Color.surface.ignoresSafeArea(edges: .top))
            .g10Rule(.bottom)
            .shadow(color: .black.opacity(shadow ? 0.05 : 0), radius: 1, y: 1)
            .zIndex(1)
    }
}

/// Three equal cells with hairline dividers around the middle one (`grid-cols-3 gap-2`, `border-x`).
struct G10StatRow<A: View, B: View, C: View>: View {
    @ViewBuilder var a: A
    @ViewBuilder var b: B
    @ViewBuilder var c: C

    var body: some View {
        HStack(spacing: Spacing.s2) {
            a.frame(maxWidth: .infinity)
            b.frame(maxWidth: .infinity)
                .g10Rule(.leading, color: .g10Divider)
                .g10Rule(.trailing, color: .g10Divider)
            c.frame(maxWidth: .infinity)
        }
    }
}

/// Bell button with the saffron unread dot.
struct G10BellButton: View {
    var showsDot = true

    var body: some View {
        Button {} label: {
            G10Icon("IconBellOutline", size: 22).foregroundStyle(Color.brandIndigo)
                .frame(width: 40, height: 40)
                .overlay(alignment: .topTrailing) {
                    if showsDot {
                        Circle().fill(Color.brandSaffron).frame(width: 8, height: 8)
                            .overlay(Circle().stroke(Color.white, lineWidth: 2).padding(-2))
                            .padding(.top, 10).padding(.trailing, 10)
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Notifications")
    }
}

extension TextStyle {
    static let g10Text11Tight = g10(11, 13.75)
}
