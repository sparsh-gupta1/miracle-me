import SwiftUI

/// Rounded search input with a leading magnifier.
struct SearchField: View {
    @Binding var text: String
    var placeholder: LocalizedStringKey = "home.search"
    var showsIcon = true
    var style: TextStyle = .xsMedium

    var body: some View {
        FieldBox(height: 40, horizontalPadding: showsIcon ? 0 : Spacing.s3) {
            if showsIcon {
                Icon(.search, size: 16).foregroundStyle(.textMuted).padding(.horizontal, Spacing.s3)
            }
            TextField(placeholder, text: $text)
                .textStyle(style)
                .foregroundStyle(.brandIndigo)
                .submitLabel(.search)
        }
    }
}
