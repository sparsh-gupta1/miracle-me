import SwiftUI

/// Full-width, 40-pt tall borderless button for secondary actions.
struct TextButton: View {
    let title: LocalizedStringKey
    var style: TextStyle = .xsMedium
    var color: Color = .brandIndigo
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .textStyle(style)
                .foregroundStyle(color)
                .frame(maxWidth: .infinity)
                .frame(height: Size.topBar)
        }
    }
}
