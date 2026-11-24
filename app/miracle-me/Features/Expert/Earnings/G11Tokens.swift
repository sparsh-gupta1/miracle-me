import SwiftUI

// Tokens used by the E-06…E-10 mock that the shared design system doesn't carry yet
// (Tailwind slate / emerald / blue palette and a few text sizes).

extension Color {
    static var g11Slate900: Color { Color(hex: 0x0F172A) }
    static var g11Slate800: Color { Color(hex: 0x1E293B) }
    static var g11Slate700: Color { Color(hex: 0x334155) }
    static var g11Slate600: Color { Color(hex: 0x475569) }
    static var g11Slate500: Color { Color(hex: 0x64748B) }
    static var g11Slate400: Color { Color(hex: 0x94A3B8) }
    static var g11Slate300: Color { Color(hex: 0xCBD5E1) }
    static var g11Slate200: Color { Color(hex: 0xE2E8F0) }
    static var g11Slate100: Color { Color(hex: 0xF1F5F9) }
    static var g11Slate50: Color { Color(hex: 0xF8FAFC) }
    static var g11Emerald50: Color { Color(hex: 0xECFDF5) }
    static var g11Emerald300: Color { Color(hex: 0x6EE7B7) }
    static var g11Emerald400: Color { Color(hex: 0x34D399) }
    static var g11Emerald500: Color { Color(hex: 0x10B981) }
    static var g11Emerald600: Color { Color(hex: 0x059669) }
    static var g11Emerald700: Color { Color(hex: 0x047857) }
    static var g11Amber50: Color { Color(hex: 0xFFFBEB) }
    static var g11Amber200: Color { Color(hex: 0xFDE68A) }
    static var g11Amber600: Color { Color(hex: 0xD97706) }
    static var g11Amber900: Color { Color(hex: 0x78350F) }
    static var g11Blue50: Color { Color(hex: 0xEFF6FF) }
    static var g11Blue700: Color { Color(hex: 0x1D4ED8) }
    static var g11Purple100: Color { Color(hex: 0xF3E8FF) }
    static var g11Purple200: Color { Color(hex: 0xE9D5FF) }
    static var g11IndigoLight: Color { Color(hex: 0xF4F1F9) }
    static var g11IndigoMid: Color { Color(hex: 0x3D2968) }
}

extension TextStyle {
    static let g11Title = TextStyle(latin: .init(size: 18, lineHeight: 28, weight: .bold))
    static let g11BarTitle = TextStyle(latin: .init(size: 16, lineHeight: 24, weight: .bold))
    static let g11Hero = TextStyle(latin: .init(size: 30, lineHeight: 36, weight: .bold, tracking: -0.025))
    static let g11Balance = TextStyle(latin: .init(size: 24, lineHeight: 32, weight: .bold))
    static let g11Value = TextStyle(latin: .init(size: 16, lineHeight: 24, weight: .bold))
    static let g11Sm = TextStyle(latin: .init(size: 14, lineHeight: 20))
    static let g11SmBold = TextStyle(latin: .init(size: 14, lineHeight: 20, weight: .bold))
    static let g11SmTight = TextStyle(latin: .init(size: 14, lineHeight: 17.5, weight: .bold))
    static let g11XsRelaxed = TextStyle(latin: .init(size: 12, lineHeight: 19.5))
    static let g11MicroCaps = TextStyle(latin: .init(size: 11, lineHeight: 16.5, weight: .bold, tracking: 0.05))
    static let g11MicroSnug = TextStyle(latin: .init(size: 11, lineHeight: 15.125))
    static let g11Nano = TextStyle(latin: .init(size: 10, lineHeight: 15))
}

/// Heroicons-style stroke icon from `IconG11*` assets (template rendering).
struct G11Icon: View {
    let name: String
    let size: CGFloat
    init(_ name: String, size: CGFloat) { self.name = "IconG11" + name; self.size = size }

    var body: some View {
        Image(name).renderingMode(.template).resizable().scaledToFit()
            .frame(width: size, height: size).accessibilityHidden(true)
    }
}

/// Initials avatar in one of the mock's tints.
struct G11Avatar: View {
    enum Tone {
        case indigo, purple, amber, slate
        fileprivate var fill: Color {
            switch self {
            case .indigo: .brandIndigo
            case .purple: .g11Purple100
            case .amber: .amber100
            case .slate: .g11Slate100
            }
        }
        fileprivate var ink: Color {
            switch self {
            case .indigo: .white
            case .purple: .brandIndigo
            case .amber: .brandSaffron
            case .slate: .g11Slate600
            }
        }
    }

    let initials: String
    var tone: Tone = .indigo
    var size: CGFloat = 44
    var showsOnline = false

    var body: some View {
        Text(verbatim: initials)
            .textStyle(size >= 44 ? .g11SmBold : .xsBold)
            .foregroundStyle(tone.ink)
            .frame(width: size, height: size)
            .background(tone.fill, in: Circle())
            .overlay(alignment: .bottomTrailing) {
                if showsOnline {
                    Circle().fill(Color.g11Emerald500).frame(width: 12, height: 12)
                        .overlay(Circle().strokeBorder(Color.surface, lineWidth: 2))
                }
            }
    }
}

/// Opaque white bar with a hairline border on one edge.
struct G11Bar<Content: View>: View {
    enum Edge { case top, bottom }
    let edge: Edge
    @ViewBuilder var content: Content

    var body: some View {
        content
            .frame(maxWidth: .infinity)
            .background(Color.surface.ignoresSafeArea(edges: edge == .top ? .top : .bottom))
            .overlay(alignment: edge == .top ? .bottom : .top) {
                Rectangle().fill(Color.brandBorder).frame(height: BorderWidth.hairline)
            }
    }
}

/// Filter pill (`rounded-full`, indigo when selected).
struct G11Pill: View {
    let title: String
    let isSelected: Bool
    var horizontal: CGFloat = Spacing.s3_5
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            Text(verbatim: title)
                .textStyle(isSelected ? .xsSemibold : .xsMedium)
                .foregroundStyle(isSelected ? Color.white : Color.g11Slate600)
                .padding(.horizontal, horizontal).padding(.vertical, Spacing.s1)
                .background(isSelected ? Color.brandIndigo : Color.brandBackground, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Small grey tag ("Kundli Career").
struct G11Tag: View {
    let text: String
    var body: some View {
        Text(verbatim: text).textStyle(.g11Nano.weight(.semibold)).foregroundStyle(Color.g11Slate700)
            .padding(.horizontal, Spacing.s1_5).padding(.vertical, Spacing.s0_5)
            .background(Color.g11Slate100, in: RoundedRectangle(cornerRadius: 4))
    }
}

extension TextStyle {
    /// Same style with another weight.
    func weight(_ weight: FontWeight) -> TextStyle {
        TextStyle(latin: .init(size: latin.size, lineHeight: latin.lineHeight, weight: weight, tracking: latin.tracking))
    }
}

enum G11Format {
    private static let formatter: NumberFormatter = {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "en_IN")
        f.numberStyle = .decimal
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        return f
    }()

    /// "₹4,820.00"
    static func rupees(_ amount: Double) -> String { "₹" + (formatter.string(from: amount as NSNumber) ?? "0.00") }
}
