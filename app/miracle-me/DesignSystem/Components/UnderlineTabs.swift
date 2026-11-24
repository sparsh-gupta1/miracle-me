import SwiftUI

struct UnderlineTabs<Value: Hashable>: View {
    struct Tab {
        let value: Value
        let title: LocalizedStringKey
    }

    let tabs: [Tab]
    @Binding var selection: Value

    var body: some View {
        HStack(spacing: 0) {
            ForEach(tabs.indices, id: \.self) { index in
                let tab = tabs[index]
                let selected = tab.value == selection
                Button { selection = tab.value } label: {
                    Text(tab.title)
                        .textStyle(.xsSemibold)
                        .foregroundStyle(selected ? Color.brandIndigo : Color.textMuted)
                        .padding(.horizontal, Spacing.s3)
                        .padding(.bottom, Spacing.s1_5)
                        .overlay(alignment: .bottom) {
                            if selected { Rectangle().fill(Color.brandIndigo).frame(height: BorderWidth.strong) }
                        }
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
        .overlay(alignment: .bottom) { Rectangle().fill(Color.brandBorder).frame(height: BorderWidth.hairline) }
    }
}
