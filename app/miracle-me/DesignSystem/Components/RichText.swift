import SwiftUI

/// Localized text with inline styling, driven by markdown in the string:
/// `**bold**` → `emphasis` style, `[label](url)` → underlined link.
/// Apply the base style with `.textStyle(...)` as usual.
struct RichText: View {
    let key: String
    var args: [String] = []
    var emphasis: TextStyle = .smSemibold
    var emphasisColor: Color = .brandIndigo

    @Environment(\.locale) private var locale

    var body: some View {
        Text(attributed)
    }

    private var attributed: AttributedString {
        let format = Bundle.main.localizedString(key, locale: locale)
        let text = String(format: format, locale: locale, arguments: args)
        var result = (try? AttributedString(markdown: text)) ?? AttributedString(text)
        let font = emphasis.font(for: FontScript(locale: locale))
        for run in result.runs {
            let isStrong = run.inlinePresentationIntent?.contains(.stronglyEmphasized) == true
            guard isStrong || run.link != nil else { continue }
            result[run.range].font = font
            result[run.range].foregroundColor = emphasisColor
            if run.link != nil { result[run.range].underlineStyle = .single }
        }
        return result
    }
}
