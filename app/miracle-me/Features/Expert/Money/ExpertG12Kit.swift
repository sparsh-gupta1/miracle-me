import SwiftUI

// MARK: Tokens local to the E-11…E-15 screens

extension ShapeStyle where Self == Color {
    static var g12CardBorder: Color { Color(hex: 0xEAE5DD) }
    static var g12HeaderBorder: Color { Color(hex: 0xECE7E0) }
    static var g12Divider: Color { Color(hex: 0xF0ECE6) }
    static var g12Muted: Color { Color(hex: 0x716B82) }
    static var g12Body: Color { Color(hex: 0x524B5E) }
    static var g12Green: Color { Color(hex: 0x2E7D32) }
    static var g12GreenTint: Color { Color(hex: 0xE8F5E9) }
    static var g12Red: Color { Color(hex: 0xC62828) }
    static var g12RedTint: Color { Color(hex: 0xFFEBEE) }
    static var g12Pending: Color { Color(hex: 0xEA580C) }
    static var g12Pill: Color { Color(hex: 0xEDE8E1) }
    static var g12PillText: Color { Color(hex: 0x625C6E) }
    static var g12Input: Color { Color(hex: 0xD8D2C7) }
    static var g12Note: Color { Color(hex: 0xF4F0E8) }
    static var g12NoteBorder: Color { Color(hex: 0xE5DFD3) }
    static var g12ToggleOff: Color { Color(hex: 0xD3CDC4) }
    static var g12HighlightEnd: Color { Color(hex: 0x1A1033) }
    static var g12OnIndigoMuted: Color { Color(hex: 0xD8D2C7) }
}

extension TextStyle {
    static let g12Title = TextStyle(latin: .init(size: 17, lineHeight: 22, weight: .bold, tracking: -0.01))
    static let g12Badge = TextStyle(latin: .init(size: 11, lineHeight: 14, weight: .bold, tracking: 0.03))
    static let g12Meta = TextStyle(latin: .init(size: 11, lineHeight: 14, weight: .medium))
    static let g12MetaRegular = TextStyle(latin: .init(size: 11, lineHeight: 14))
    static let g12MetaSemibold = TextStyle(latin: .init(size: 11, lineHeight: 14, weight: .semibold))
    static let g12MetaBold = TextStyle(latin: .init(size: 11, lineHeight: 14, weight: .bold))
    static let g12Para11 = TextStyle(latin: .init(size: 11, lineHeight: 15.4))
    static let g12Para115 = TextStyle(latin: .init(size: 11.5, lineHeight: 16.7))
    static let g12Row115 = TextStyle(latin: .init(size: 11.5, lineHeight: 15))
    static let g12Row115Semibold = TextStyle(latin: .init(size: 11.5, lineHeight: 15, weight: .semibold))
    static let g12Amount = TextStyle(latin: .init(size: 16, lineHeight: 20, weight: .bold))
    static let g12Stat = TextStyle(latin: .init(size: 18, lineHeight: 23, weight: .bold))
    static let g12Hero = TextStyle(latin: .init(size: 22, lineHeight: 28, weight: .bold))
    static let g12Label105 = TextStyle(latin: .init(size: 10.5, lineHeight: 14, weight: .semibold))
    static let g12Caption105 = TextStyle(latin: .init(size: 10.5, lineHeight: 14))
    static let g12Label105Caps = TextStyle(latin: .init(size: 10.5, lineHeight: 14, weight: .bold))
    static let g12Nano = TextStyle(latin: .init(size: 10, lineHeight: 13))
    static let g12NanoMedium = TextStyle(latin: .init(size: 10, lineHeight: 13, weight: .medium))
    static let g12NanoBold = TextStyle(latin: .init(size: 10, lineHeight: 13, weight: .bold))
    static let g12Mono10 = TextStyle(latin: .init(size: 10, lineHeight: 13, monospaced: true))
    static let g12Mono11 = TextStyle(latin: .init(size: 11, lineHeight: 14, monospaced: true))
    static let g12Sec13 = TextStyle(latin: .init(size: 13, lineHeight: 17, weight: .bold))
    static let g12Sec125 = TextStyle(latin: .init(size: 12.5, lineHeight: 16, weight: .bold))
    static let g12Item125 = TextStyle(latin: .init(size: 12.5, lineHeight: 16, weight: .semibold))
    static let g12Item13 = TextStyle(latin: .init(size: 13, lineHeight: 17, weight: .bold))
    static let g12Input12 = TextStyle(latin: .init(size: 12, lineHeight: 16))
    static let g12Btn14 = TextStyle(latin: .init(size: 14, lineHeight: 18, weight: .bold))
    static let g12Btn125 = TextStyle(latin: .init(size: 12.5, lineHeight: 16, weight: .bold))
    static let g12BtnSec = TextStyle(latin: .init(size: 13, lineHeight: 17, weight: .bold))
    static let g12Tier = TextStyle(latin: .init(size: 11.5, lineHeight: 15, weight: .semibold))
    static let g12TierActive = TextStyle(latin: .init(size: 11.5, lineHeight: 15, weight: .bold))
    static let g12Help = TextStyle(latin: .init(size: 12, lineHeight: 16))
    static let g12HelpLink = TextStyle(latin: .init(size: 12, lineHeight: 16, weight: .bold))
    static let g12Para12 = TextStyle(latin: .init(size: 12, lineHeight: 16, weight: .bold))
}

// MARK: Pieces

/// Icon loaded straight from this group's assets (`IconG12…`).
struct G12Icon: View {
    let name: String
    let size: CGFloat

    var body: some View {
        Image(name).resizable().frame(width: size, height: size).accessibilityHidden(true)
    }
}

/// 56-pt app bar: back button, title, optional trailing slot, bottom hairline.
struct G12Header<Trailing: View>: View {
    let title: LocalizedStringKey
    var onBack: () -> Void
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 0) {
            HStack(spacing: Spacing.s3) {
                Button(action: onBack) {
                    G12Icon(name: "IconG12ArrowLeftBold", size: 20).foregroundStyle(.brandIndigo)
                        .frame(width: 36, height: 36)
                }
                .accessibilityLabel("Back")
                Text(title).textStyle(.g12Title).foregroundStyle(.brandIndigo)
            }
            Spacer(minLength: Spacing.s2)
            trailing
        }
        .padding(.horizontal, Spacing.s4)
        .frame(height: 56)
        .background(Color.brandBackground)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.g12HeaderBorder).frame(height: BorderWidth.hairline) }
    }
}

/// 36-pt round icon button used in the app bar's trailing slot.
struct G12IconButton: View {
    let icon: String
    var size: CGFloat = 18
    var tint: Color = .brandIndigo
    let label: LocalizedStringKey
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            G12Icon(name: icon, size: size).foregroundStyle(tint).frame(width: 36, height: 36)
        }
        .accessibilityLabel(label)
    }
}

/// Scrolling page body: 16-pt inset, 16-pt gaps.
struct G12Scroll<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s4) { content }
                .padding(Spacing.s4)
        }
        .scrollIndicators(.hidden)
    }
}

struct G12Screen<Header: View, Content: View>: View {
    @ViewBuilder var header: Header
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 0) {
            header
            G12Scroll { content }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.brandBackground.ignoresSafeArea())
    }
}

extension View {
    /// White card: 14 radius, warm border, soft indigo shadow. `accent` draws the 3-pt left edge.
    func g12Card(padding: CGFloat = Spacing.s4, background: Color = .surface, border: Color = .g12CardBorder,
                 borderWidth: CGFloat = BorderWidth.hairline, accent: Color? = nil) -> some View {
        let shape = RoundedRectangle(cornerRadius: Radius.lg)
        return self
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(background, in: shape)
            .overlay(alignment: .leading) {
                if let accent { Rectangle().fill(accent).frame(width: 3) }
            }
            .clipShape(shape)
            .overlay(shape.strokeBorder(border, lineWidth: borderWidth))
            .shadow(color: Color.brandIndigo.opacity(0.04), radius: 4, y: 2)
    }
}

struct G12Pill: View {
    let title: LocalizedStringKey
    let isActive: Bool
    var horizontal: CGFloat = 14
    var vertical: CGFloat = Spacing.s1_5
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).textStyle(.xsSemibold)
                .foregroundStyle(isActive ? Color.white : Color.g12PillText)
                .padding(.horizontal, horizontal).padding(.vertical, vertical)
                .background(isActive ? Color.brandIndigo : Color.g12Pill, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }
}

/// Saffron call-to-action with the mock's tinted shadow.
struct G12PrimaryButton: View {
    let title: LocalizedStringKey
    var height: CGFloat = 48
    var textStyle: TextStyle = .g12Btn14
    let action: () -> Void

    var body: some View {
        Button(action: action) { Text(title).textStyle(textStyle) }
            .buttonStyle(PrimaryButtonStyle(radius: Radius.sm, height: height))
            .shadow(color: Color.brandSaffron.opacity(0.25), radius: 4, y: 2)
    }
}

/// White button with a 1.5-pt indigo outline.
struct G12SecondaryButton: View {
    let title: LocalizedStringKey
    var height: CGFloat = 44
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).textStyle(.g12BtnSec).foregroundStyle(.brandIndigo)
                .frame(maxWidth: .infinity).frame(height: height)
                .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.sm))
                .overlay(RoundedRectangle(cornerRadius: Radius.sm).strokeBorder(Color.brandIndigo, lineWidth: BorderWidth.selected))
        }
        .buttonStyle(.plain)
    }
}

/// "Need help? Contact support" style line.
struct G12SupportLine: View {
    let prefix: LocalizedStringKey
    let link: LocalizedStringKey
    let action: () -> Void

    var body: some View {
        HStack(spacing: Spacing.s1) {
            Text(prefix).textStyle(.g12Help).foregroundStyle(.g12Muted)
            Button(action: action) {
                Text(link).textStyle(.g12HelpLink).foregroundStyle(.brandIndigo).underline()
            }
            .buttonStyle(.plain)
        }
    }
}

/// Label on the left, value on the right (`justify-between`).
struct G12KeyValueRow: View {
    let label: LocalizedStringKey
    let value: String
    var valueStyle: TextStyle = .g12Row115Semibold
    var valueColor: Color = .brandIndigo
    var labelStyle: TextStyle = .g12Row115

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Spacing.s2) {
            Text(label).textStyle(labelStyle).foregroundStyle(.g12Body)
            Spacer(minLength: Spacing.s2)
            Text(verbatim: value).textStyle(valueStyle).foregroundStyle(valueColor).multilineTextAlignment(.trailing)
        }
    }
}

/// Inset FAF8F5 panel holding key/value rows.
struct G12InsetPanel<Content: View>: View {
    var spacing: CGFloat = Spacing.s1_5
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: spacing) { content }
            .padding(Spacing.s2_5)
            .frame(maxWidth: .infinity)
            .background(Color.brandBackground, in: RoundedRectangle(cornerRadius: Radius.xs))
    }
}

extension TextStyle {
    static let g12BankMark = TextStyle(latin: .init(size: 13, lineHeight: 17, weight: .bold))
    /// 11 pt on a 1.5 line, right-hand rating breakdown.
    static let g12Para11Wide = TextStyle(latin: .init(size: 11, lineHeight: 16.5))
}
