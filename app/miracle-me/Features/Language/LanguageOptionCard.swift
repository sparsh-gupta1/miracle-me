import SwiftUI

struct LanguageOptionCard: View {
    let language: AppLanguage
    let isSelected: Bool
    let action: () -> Void

    private let shape = RoundedRectangle(cornerRadius: Radius.md)

    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.s3_5) {
                glyphBadge
                VStack(alignment: .leading, spacing: 0) {
                    Text(verbatim: language.nativeName)
                        .textStyle(.cardTitle, script: language.script)
                        .foregroundStyle(isSelected ? Color.brandIndigo : Color.textPrimary)
                    Text(verbatim: language.appInLanguage)
                        .textStyle(.cardCaption, script: language.script)
                        .foregroundStyle(.textSecondary)
                }
                Spacer(minLength: 0)
                radio
            }
            .padding(Spacing.s3_5)
            .frame(height: 72)
            .background(isSelected ? Color.brandSaffronTint : Color.surface, in: shape)
            .overlay(shape.strokeBorder(isSelected ? Color.brandIndigo : Color.brandBorder,
                                        lineWidth: isSelected ? BorderWidth.selected : BorderWidth.hairline))
            .shadow(color: .black.opacity(isSelected ? 0.05 : 0), radius: 1, y: 1)
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var glyphBadge: some View {
        let shape = RoundedRectangle(cornerRadius: Radius.sm)
        return Text(verbatim: language.badgeGlyph)
            .textStyle(.badgeGlyph, script: language.script)
            .foregroundStyle(isSelected ? Color.brandSaffronTint : Color.brandIndigo)
            .frame(width: 44, height: 44)
            .background(isSelected ? Color.brandIndigo : Color.brandIndigoTint, in: shape)
            .overlay { if !isSelected { shape.strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline) } }
    }

    private var radio: some View {
        Circle()
            .strokeBorder(isSelected ? Color.brandSaffron : Color.brandBorder, lineWidth: BorderWidth.strong)
            .frame(width: 24, height: 24)
            .overlay { if isSelected { Circle().fill(Color.brandSaffron).frame(width: 12, height: 12) } }
    }
}
