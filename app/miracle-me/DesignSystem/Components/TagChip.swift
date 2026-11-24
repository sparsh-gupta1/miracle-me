import SwiftUI

/// Small pill label used in top bars.
struct TagChip<Label: View>: View {
    enum Tone {
        case amber, amberOutlined, indigoOutlined, emeraldOutlined

        fileprivate var foreground: Color {
            switch self {
            case .amber, .amberOutlined: .statusBusyText
            case .indigoOutlined: .brandIndigo
            case .emeraldOutlined: .statusOnlineText
            }
        }
        fileprivate var background: Color {
            switch self {
            case .amber: .amber100
            case .amberOutlined: .amber50
            case .indigoOutlined: .indigo50
            case .emeraldOutlined: .emerald50
            }
        }
        fileprivate var border: Color? {
            switch self {
            case .amber: nil
            case .amberOutlined: .amber200
            case .indigoOutlined: .indigo100
            case .emeraldOutlined: .emerald100
            }
        }
    }

    let tone: Tone
    @ViewBuilder var label: Label

    var body: some View {
        label
            .textStyle(.microSemibold)
            .foregroundStyle(tone.foreground)
            .padding(.horizontal, Spacing.s2_5)
            .padding(.vertical, Spacing.s0_5)
            .background(tone.background, in: Capsule())
            .overlay { if let border = tone.border { Capsule().strokeBorder(border, lineWidth: BorderWidth.hairline) } }
    }
}
