import SwiftUI

struct SegmentedControl<Value: Hashable>: View {
    struct Option {
        let value: Value
        let title: LocalizedStringKey
    }

    let options: [Option]
    @Binding var selection: Value

    var body: some View {
        HStack(spacing: 0) {
            ForEach(options.indices, id: \.self) { index in
                let option = options[index]
                let selected = option.value == selection
                Button { selection = option.value } label: {
                    Text(option.title)
                        .textStyle(.smSemibold)
                        .foregroundStyle(selected ? Color.brandIndigo : Color.textSecondary)
                        .padding(.vertical, Spacing.s2)
                        .frame(maxWidth: .infinity)
                        .background { if selected { RoundedRectangle(cornerRadius: 11).fill(Color.surface).elevationSm() } }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(Spacing.s1)
        .background(Color.brandBorder, in: RoundedRectangle(cornerRadius: Radius.lg))
        .animation(.easeInOut(duration: 0.2), value: selection)
    }
}
