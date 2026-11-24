import SwiftUI

struct PrimaryButton: View {
    let title: LocalizedStringKey
    var icon: AppIcon?
    var radius: CGFloat = Radius.lg
    var height: CGFloat = Size.control
    var textStyle: TextStyle = .button
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.s2) {
                if let icon { Icon(icon, size: 18) }
                Text(title).textStyle(textStyle)
            }
        }
        .buttonStyle(PrimaryButtonStyle(radius: radius, height: height))
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    var radius: CGFloat = Radius.lg
    var height: CGFloat = Size.control
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        let background: Color = !isEnabled ? .brandBorder : pressed ? .brandSaffronPressed : .brandSaffron
        let foreground: Color = !isEnabled ? .textSecondary : pressed ? .textPrimary : .brandIndigo
        configuration.label
            .foregroundStyle(foreground)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(background, in: RoundedRectangle(cornerRadius: radius))
            .shadow(color: .black.opacity(isEnabled ? 0.05 : 0), radius: 1, y: 1)
            .animation(.easeInOut(duration: 0.2), value: pressed)
    }
}
