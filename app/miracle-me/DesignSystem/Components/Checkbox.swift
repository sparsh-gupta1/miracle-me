import SwiftUI

/// 16-pt square checkbox. Use as `Toggle(isOn:) { label }.toggleStyle(.checkbox)`.
struct CheckboxToggleStyle: ToggleStyle {
    var alignment: VerticalAlignment = .center
    var spaceBetween = false

    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: alignment, spacing: Spacing.s2_5) {
            if spaceBetween {
                configuration.label
                Spacer(minLength: 0)
                box(isOn: configuration.isOn)
            } else {
                box(isOn: configuration.isOn)
                configuration.label
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { configuration.isOn.toggle() }
        .accessibilityAddTraits(.isButton)
    }

    private func box(isOn: Bool) -> some View {
        RoundedRectangle(cornerRadius: 4)
            .fill(isOn ? Color.brandIndigo : Color.surface)
            .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(isOn ? Color.brandIndigo : Color.textMuted, lineWidth: BorderWidth.hairline))
            .overlay { if isOn { Icon(.checkBold, size: 12).foregroundStyle(.white) } }
            .frame(width: 16, height: 16)
    }
}

extension ToggleStyle where Self == CheckboxToggleStyle {
    static var checkbox: CheckboxToggleStyle { .init() }
    static func checkbox(alignment: VerticalAlignment) -> CheckboxToggleStyle { .init(alignment: alignment) }
    static func checkbox(spaceBetween: Bool) -> CheckboxToggleStyle { .init(spaceBetween: spaceBetween) }
}
