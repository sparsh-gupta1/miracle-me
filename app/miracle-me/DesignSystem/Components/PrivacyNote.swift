import SwiftUI

struct PrivacyNote: View {
    var text: LocalizedStringKey = "privacy.note"
    var style: TextStyle = .note

    var body: some View {
        HStack(spacing: Spacing.s1_5) {
            Text("🔒")
            Text(text)
        }
        .textStyle(style)
        .foregroundStyle(.textSecondary)
    }
}
