import SwiftUI

/// Tinted rounded box for hints, errors and warnings.
struct Callout<Content: View>: View {
    enum Tone {
        case info          // indigo tint, no border
        case infoBordered  // indigo tint, neutral border
        case notice        // saffron tint, saffron border
        case warning       // saffron tint, orange border
        case error         // red tint, red border
        case busy          // orange-50 tint, orange-200 border

        fileprivate var background: Color {
            switch self {
            case .info, .infoBordered: .brandIndigoTint
            case .notice, .warning: .brandSaffronTint
            case .error: .statusCriticalBackground
            case .busy: .noticeBackground
            }
        }
        fileprivate var border: Color? {
            switch self {
            case .info: nil
            case .infoBordered: .brandBorder
            case .notice: Color.brandSaffron.opacity(0.4)
            case .warning: Color.statusBusyDot.opacity(0.3)
            case .error: Color.statusCritical.opacity(0.3)
            case .busy: .noticeBorder
            }
        }
    }

    var tone: Tone = .info
    var padding: CGFloat = Spacing.s3
    var radius: CGFloat = Radius.md
    var alignment: VerticalAlignment = .top
    @ViewBuilder var content: Content

    var body: some View {
        HStack(alignment: alignment, spacing: Spacing.s2_5) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tone.background, in: RoundedRectangle(cornerRadius: radius))
            .overlay {
                if let border = tone.border {
                    RoundedRectangle(cornerRadius: radius).strokeBorder(border, lineWidth: BorderWidth.hairline)
                }
            }
    }
}
