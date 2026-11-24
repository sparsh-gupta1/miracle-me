import SwiftUI

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

/// App-wide color tokens. Use as `.foregroundStyle(.brandIndigo)` or `Color.brandIndigo`.
extension ShapeStyle where Self == Color {
    // Brand
    static var brandIndigo: Color { Color(hex: 0x2A1B4E) }
    static var brandIndigoTint: Color { Color(hex: 0xF5F2F9) }
    static var brandIndigoSoft: Color { Color(hex: 0xE9E2F5) }
    static var brandSaffron: Color { Color(hex: 0xE58E26) }
    static var brandSaffronPressed: Color { Color(hex: 0xC9771B) }
    static var brandSaffronTint: Color { Color(hex: 0xFFF8F0) }
    static var brandBackground: Color { Color(hex: 0xFAF8F5) }
    static var brandBorder: Color { Color(hex: 0xEBE6DF) }
    static var surface: Color { Color(hex: 0xFFFFFF) }

    // Text
    static var textPrimary: Color { Color(hex: 0x1E1B26) }
    static var textSecondary: Color { Color(hex: 0x686375) }

    // Status
    static var statusOnlineDot: Color { Color(hex: 0x16A34A) }
    static var statusOnlineText: Color { Color(hex: 0x15803D) }
    static var statusOnlineBackground: Color { Color(hex: 0xDCFCE7) }
    static var statusBusyDot: Color { Color(hex: 0xEA580C) }
    static var statusBusyText: Color { Color(hex: 0xC2410C) }
    static var statusBusyBackground: Color { Color(hex: 0xFFEDD5) }
    static var statusOfflineDot: Color { Color(hex: 0x64748B) }
    static var statusOfflineText: Color { Color(hex: 0x475569) }
    static var statusOfflineBackground: Color { Color(hex: 0xF1F5F9) }
    static var statusCritical: Color { Color(hex: 0xDC2626) }
    static var statusCriticalBackground: Color { Color(hex: 0xFEF2F2) }

    // Customer-screen neutrals
    static var textMuted: Color { Color(hex: 0x64748B) }
    static var borderMuted: Color { Color(hex: 0xCBD5E1) }
    static var surfaceLavender: Color { Color(hex: 0xF1EBF9) }
    static var borderLavender: Color { Color(hex: 0xE2D9F3) }
    static var borderVideo: Color { Color(hex: 0xE6E0F0) }
    static var textOnIndigoMuted: Color { Color(hex: 0xCFBDFB) }
    static var avatarLavender: Color { Color(hex: 0xE9E2F5) }
    static var avatarPeach: Color { Color(hex: 0xFCE7D6) }
    static var scrim: Color { Color(hex: 0x1E1B26, opacity: 0.4) }

    // Expert-detail neutrals
    static var textBody: Color { Color(hex: 0x5C5668) }
    static var textFaint: Color { Color(hex: 0x8E8A99) }
    static var dividerSoft: Color { Color(hex: 0xF5F2EC) }
    static var borderTag: Color { Color(hex: 0xE5DEEE) }
    static var borderAvatarLavender: Color { Color(hex: 0xD5CBE5) }
    static var borderAvatarPeach: Color { Color(hex: 0xF3CDB3) }
    static var noticeBackground: Color { Color(hex: 0xFFF7ED) }
    static var noticeBorder: Color { Color(hex: 0xFED7AA) }
    static var noticeTitle: Color { Color(hex: 0x9A3412) }

    // Tag palette
    static var amber50: Color { Color(hex: 0xFFFBEB) }
    static var amber100: Color { Color(hex: 0xFEF3C7) }
    static var amber200: Color { Color(hex: 0xFDE68A) }
    static var indigo50: Color { Color(hex: 0xEEF2FF) }
    static var indigo100: Color { Color(hex: 0xE0E7FF) }
    static var emerald50: Color { Color(hex: 0xECFDF5) }
    static var emerald100: Color { Color(hex: 0xD1FAE5) }
}
