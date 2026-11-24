import CoreText
import SwiftUI
import UIKit

enum FontWeight { case regular, medium, semibold, bold }

/// Script a piece of text is set in. Picks the typeface and the matching size spec.
enum FontScript {
    case latin, devanagari

    init(locale: Locale) {
        self = locale.language.languageCode?.identifier == "hi" ? .devanagari : .latin
    }

    fileprivate func fontName(_ weight: FontWeight) -> String {
        let prefix = self == .latin ? "Poppins" : "NotoSansDevanagari"
        switch weight {
        case .regular: return "\(prefix)-Regular"
        case .medium: return "\(prefix)-Medium"
        case .semibold: return "\(prefix)-SemiBold"
        case .bold: return "\(prefix)-Bold"
        }
    }
}

/// Size / line height / tracking (em) / weight for one script.
struct TextSpec {
    let size: CGFloat
    let lineHeight: CGFloat
    var weight: FontWeight = .regular
    var tracking: CGFloat = 0
    var monospaced = false
}

/// Tailwind-style line-height multiples.
enum Leading: CGFloat { case tight = 1.25, snug = 1.375, normal = 1.5, relaxed = 1.625 }

extension TextSpec {
    init(_ size: CGFloat, _ leading: Leading = .normal, _ weight: FontWeight = .regular) {
        self.init(size: size, lineHeight: size * leading.rawValue, weight: weight)
    }
}

/// App-wide text styles. Apply with `.textStyle(.body)`.
struct TextStyle {
    let latin: TextSpec
    let devanagari: TextSpec

    init(latin: TextSpec, devanagari: TextSpec? = nil) {
        self.latin = latin
        self.devanagari = devanagari ?? latin
    }

    init(_ spec: TextSpec) { self.init(latin: spec) }

    func spec(for script: FontScript) -> TextSpec {
        script == .latin ? latin : devanagari
    }

    /// Font only (no line-height / tracking), for styled runs inside an AttributedString.
    func font(for script: FontScript) -> Font {
        let spec = spec(for: script)
        return spec.monospaced
            ? .system(size: spec.size, design: .monospaced)
            : .custom(script.fontName(spec.weight), size: spec.size)
    }

    static let display = TextStyle(latin: .init(size: 28, lineHeight: 34, weight: .bold, tracking: -0.025))
    static let tagline = TextStyle(
        latin: .init(size: 14, lineHeight: 22, weight: .medium, tracking: 0.025),
        devanagari: .init(size: 15, lineHeight: 22, weight: .medium))
    static let heroTitle = TextStyle(
        latin: .init(size: 22, lineHeight: 29, weight: .semibold),
        devanagari: .init(size: 21, lineHeight: 29, weight: .semibold))
    static let screenTitle = TextStyle(latin: .init(size: 20, lineHeight: 28, weight: .semibold))
    static let screenSubtitle = TextStyle(
        latin: .init(size: 17, lineHeight: 24, weight: .semibold),
        devanagari: .init(size: 18, lineHeight: 24, weight: .semibold))
    static let body = TextStyle(latin: .init(size: 14, lineHeight: 22))
    static let hint = TextStyle(latin: .init(size: 13, lineHeight: 19))
    static let cardTitle = TextStyle(latin: .init(size: 16, lineHeight: 22, weight: .semibold))
    static let cardCaption = TextStyle(latin: .init(size: 12, lineHeight: 16))
    static let badgeGlyph = TextStyle(latin: .init(size: 18, lineHeight: 27, weight: .bold))
    static let note = TextStyle(
        latin: .init(size: 12, lineHeight: 18, weight: .medium),
        devanagari: .init(size: 13, lineHeight: 18, weight: .medium))
    static let label = TextStyle(latin: .init(size: 12, lineHeight: 18, weight: .medium))
    static let button = TextStyle(latin: .init(size: 16, lineHeight: 24, weight: .semibold))
    static let link = TextStyle(latin: .init(size: 14, lineHeight: 21, weight: .medium))
    static let version = TextStyle(latin: .init(size: 11, lineHeight: 14, tracking: 0.05, monospaced: true))

    // Titles & body
    static let pageTitle = TextStyle(.init(22, .tight, .bold))
    static let sectionTitle = TextStyle(.init(20, .tight, .bold))
    static let subtitle = TextStyle(.init(14, .snug))
    static let bodyDefault = TextStyle(.init(14))
    static let bodyStrong = TextStyle(.init(14, .normal, .semibold))
    static let bodyBold = TextStyle(.init(14, .normal, .bold))
    static let input = TextStyle(.init(16, .normal, .semibold))
    static let otpDigit = TextStyle(.init(22, .normal, .bold))

    // 13 pt
    static let smSnug = TextStyle(.init(13, .snug))
    static let sm = TextStyle(.init(13))
    static let smMedium = TextStyle(.init(13, .normal, .medium))
    static let smSemibold = TextStyle(.init(13, .normal, .semibold))
    static let smBold = TextStyle(.init(13, .normal, .bold))

    // 12 pt and below
    static let captionRelaxed = TextStyle(.init(12, .relaxed))
    static let labelStrong = TextStyle(.init(12, .normal, .semibold))
    static let labelBold = TextStyle(.init(12, .normal, .bold))
    // 12 pt on a 16 pt line (Tailwind `text-xs`)
    static let xs = TextStyle(latin: .init(size: 12, lineHeight: 16))
    static let xsMedium = TextStyle(latin: .init(size: 12, lineHeight: 16, weight: .medium))
    static let xsSemibold = TextStyle(latin: .init(size: 12, lineHeight: 16, weight: .semibold))
    static let xsSemiboldCaps = TextStyle(latin: .init(size: 12, lineHeight: 16, weight: .semibold, tracking: 0.05))
    static let xsBold = TextStyle(latin: .init(size: 12, lineHeight: 16, weight: .bold))
    static let lockup = TextStyle(latin: .init(size: 14, lineHeight: 20, weight: .bold))
    static let bodyRelaxed = TextStyle(.init(14, .relaxed))
    static let micro = TextStyle(.init(11))
    static let microMedium = TextStyle(.init(11, .normal, .medium))
    static let microSemibold = TextStyle(.init(11, .normal, .semibold))
    static let nano = TextStyle(.init(10))
    static let fine = TextStyle(.init(10.5))
    static let nanoMedium = TextStyle(.init(10, .normal, .medium))
    static let nanoSemibold = TextStyle(.init(10, .normal, .semibold))
    static let nanoBold = TextStyle(.init(10, .normal, .bold))
    static let eyebrow = TextStyle(latin: .init(size: 10, lineHeight: 15, weight: .bold, tracking: 0.1))
    static let nanoCaps = TextStyle(latin: .init(size: 10, lineHeight: 15, weight: .semibold, tracking: 0.05))
    static let microCaps = TextStyle(latin: .init(size: 11, lineHeight: 16.5, weight: .semibold, tracking: 0.05))
    static let screenHeading = TextStyle(latin: .init(size: 24, lineHeight: 32, weight: .bold, tracking: -0.025))
    static let field = TextStyle(latin: .init(size: 14, lineHeight: 20, weight: .semibold))
    static let fieldMedium = TextStyle(latin: .init(size: 14, lineHeight: 20, weight: .medium))
    static let baseBold = TextStyle(latin: .init(size: 16, lineHeight: 24, weight: .bold))
    static let compactButton = TextStyle(latin: .init(size: 14, lineHeight: 20, weight: .bold))
    static let microSnug = TextStyle(.init(11, .snug))
    static let microBold = TextStyle(.init(11, .normal, .bold))
    static let profileName = TextStyle(.init(16, .tight, .bold))
    static let avatarLarge = TextStyle(latin: .init(size: 20, lineHeight: 28, weight: .bold))
    static let avatarHero = TextStyle(latin: .init(size: 24, lineHeight: 32, weight: .bold))
    static let countdown = TextStyle(latin: .init(size: 30, lineHeight: 36, weight: .bold, tracking: 0.05))
    static let fineBold = TextStyle(.init(10.5, .normal, .bold))
}

private struct TextStyleModifier: ViewModifier {
    let style: TextStyle
    let script: FontScript?
    @Environment(\.locale) private var locale

    func body(content: Content) -> some View {
        let spec = style.spec(for: script ?? FontScript(locale: locale))
        let name = (script ?? FontScript(locale: locale)).fontName(spec.weight)
        let natural = spec.monospaced
            ? UIFont.monospacedSystemFont(ofSize: spec.size, weight: .regular).lineHeight
            : (UIFont(name: name, size: spec.size)?.lineHeight ?? spec.lineHeight)
        // CSS line-height adds half-leading above and below every line.
        let leading = spec.lineHeight - natural

        content
            .font(style.font(for: script ?? FontScript(locale: locale)))
            .tracking(spec.tracking * spec.size)
            .lineSpacing(leading)
            .padding(.vertical, leading / 2)
            .fixedSize(horizontal: false, vertical: true)
    }
}

extension View {
    /// Applies a text style. `script` overrides the typeface when the text's
    /// language differs from the app locale.
    func textStyle(_ style: TextStyle, script: FontScript? = nil) -> some View {
        modifier(TextStyleModifier(style: style, script: script))
    }
}

enum FontRegistry {
    /// Registers the bundled fonts. Call once at launch.
    static func registerAll() {
        let urls = (Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? [])
        CTFontManagerRegisterFontURLs(urls as CFArray, .process, true, nil)
    }
}
