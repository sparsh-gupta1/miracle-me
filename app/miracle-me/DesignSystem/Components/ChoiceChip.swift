import SwiftUI

/// Selectable pill/button. Selected = indigo fill, otherwise white with a hairline border.
struct ChoiceChip: View {
    enum Size {
        case field        // 40-pt tall form button
        case option       // filter-sheet option, 12 pt
        case optionSmall  // filter-sheet option, 11 pt
        case tag          // quick-filter tag, 10 pt
        case category     // home category chip, 11 pt

        fileprivate var style: TextStyle {
            switch self {
            case .field, .option: .xsSemibold
            case .optionSmall, .category: .microSemibold
            case .tag: .nanoSemibold
            }
        }
        fileprivate var radius: CGFloat { self == .field ? Radius.md : Radius.xs }
        fileprivate var vertical: CGFloat {
            switch self {
            case .field: 0
            case .option, .optionSmall: Spacing.s1_5
            case .tag, .category: Spacing.s1
            }
        }
        fileprivate var horizontal: CGFloat { (self == .tag || self == .category) ? Spacing.s2_5 : 0 }
    }

    let title: LocalizedStringKey
    var isSelected = false
    var size: Size = .option
    var action: () -> Void = {}

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: size.radius)
        Button(action: action) {
            Text(title)
                .textStyle(size.style)
                .foregroundStyle(isSelected ? Color.white : Color.brandIndigo)
                .padding(.vertical, size.vertical + BorderWidth.hairline)
                .padding(.horizontal, size.horizontal)
                .frame(maxWidth: size.horizontal == 0 ? .infinity : nil)
                .frame(height: size == .field ? 40 : nil)
                .background(isSelected ? Color.brandIndigo : Color.surface, in: shape)
                .overlay(shape.strokeBorder(isSelected ? Color.brandIndigo : Color.brandBorder, lineWidth: BorderWidth.hairline))
                .contentShape(shape)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// Grid of mutually exclusive `ChoiceChip`s; tapping the selected one clears it when `allowsDeselect`.
struct ChoiceGroup<Value: Hashable>: View {
    struct Option {
        let value: Value
        let title: LocalizedStringKey
    }

    let options: [Option]
    @Binding var selection: Value?
    var columns = 3
    var spacing: CGFloat = Spacing.s2
    var size: ChoiceChip.Size = .option
    var allowsDeselect = false

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: spacing), count: columns), spacing: spacing) {
            ForEach(options.indices, id: \.self) { index in
                let option = options[index]
                ChoiceChip(title: option.title, isSelected: selection == option.value, size: size) {
                    selection = (allowsDeselect && selection == option.value) ? nil : option.value
                }
            }
        }
    }
}
