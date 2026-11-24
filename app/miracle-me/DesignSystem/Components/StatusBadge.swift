import SwiftUI

enum StatusTone {
    case online, busy, offline

    var dot: Color {
        switch self {
        case .online: .statusOnlineDot
        case .busy: .statusBusyDot
        case .offline: .statusOfflineDot
        }
    }
    var text: Color {
        switch self {
        case .online: .statusOnlineText
        case .busy: .statusBusyText
        case .offline: .statusOfflineText
        }
    }
    var background: Color {
        switch self {
        case .online: .statusOnlineBackground
        case .busy: .statusBusyBackground
        case .offline: .statusOfflineBackground
        }
    }
}

/// Pill with a status dot and a hairline border.
struct StatusBadge: View {
    let tone: StatusTone
    let title: LocalizedStringKey

    var body: some View {
        HStack(spacing: Spacing.s1_5) {
            Circle().fill(tone.dot).frame(width: 6, height: 6)
            Text(title).textStyle(.label).foregroundStyle(tone.text)
        }
        .padding(.horizontal, Spacing.s3)
        .padding(.vertical, Spacing.s1)
        .background(tone.background, in: Capsule())
        .overlay(Capsule().strokeBorder(tone.dot.opacity(0.2), lineWidth: BorderWidth.hairline))
    }
}

/// Compact text-only status pill.
struct StatusPill: View {
    let tone: StatusTone
    let title: LocalizedStringKey

    var body: some View {
        Text(title)
            .textStyle(.microSemibold)
            .foregroundStyle(tone.text)
            .padding(.horizontal, Spacing.s2)
            .padding(.vertical, Spacing.s0_5)
            .background(tone.background, in: Capsule())
    }
}
