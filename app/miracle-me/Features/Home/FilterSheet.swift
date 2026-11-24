import SwiftUI

/// C-05 filter bottom sheet. Present with `.sheet` + `.presentationDetents`.
struct FilterSheet: View {
    @Binding var filters: ExpertFilters
    let onApply: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Capsule().fill(Color.brandBorder).frame(width: 40, height: 4).padding(.bottom, Spacing.s3)
            HStack {
                Text("filter.title").textStyle(.baseBold).foregroundStyle(.brandIndigo)
                Spacer(minLength: 0)
                Button { filters = ExpertFilters() } label: {
                    Text("filter.reset").textStyle(.xsSemibold).foregroundStyle(.textMuted)
                }
            }
            .padding(.bottom, Spacing.s4)
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s3_5) {
                    section("filter.type") {
                        ChoiceGroup(options: [.init(value: .astrologer, title: "filter.type.astrologer"),
                                              .init(value: .listener, title: "filter.type.listener")],
                                    selection: $filters.kind, columns: 2)
                    }
                    Toggle(isOn: $filters.onlineOnly) {
                        Text("filter.onlineOnly").textStyle(.xsSemibold).foregroundStyle(.brandIndigo)
                    }
                    .toggleStyle(.checkbox(spaceBetween: true))
                    .padding(.vertical, Spacing.s1)
                    section("filter.price") {
                        ChoiceGroup(options: [.init(value: .under, title: "Under ₹\(PriceBands.low)"),
                                              .init(value: .mid, title: "₹\(PriceBands.low)–₹\(PriceBands.high)"),
                                              .init(value: .high, title: "₹\(PriceBands.high)+")],
                                    selection: $filters.price, spacing: Spacing.s1_5, size: .optionSmall)
                    }
                    section("filter.rating") {
                        ChoiceGroup(options: [.init(value: .fourPlus, title: "filter.rating.four"),
                                              .init(value: .all, title: "filter.rating.all")],
                                    selection: $filters.rating, columns: 2)
                    }
                    section("filter.gender") {
                        ChoiceGroup(options: [.init(value: .any, title: "filter.gender.any"),
                                              .init(value: .female, title: "gender.female"),
                                              .init(value: .male, title: "gender.male")],
                                    selection: $filters.gender, spacing: Spacing.s1_5, size: .optionSmall)
                    }
                    section("filter.experience") {
                        ChoiceGroup(options: [.init(value: .oneToThree, title: "1–3 yrs"),
                                              .init(value: .fivePlus, title: "5+ yrs"),
                                              .init(value: .tenPlus, title: "10+ yrs")],
                                    selection: $filters.experience, spacing: Spacing.s1_5, size: .optionSmall)
                    }
                }
                .padding(.trailing, Spacing.s1)
            }
            .scrollIndicators(.hidden)
            PrimaryButton(title: "filter.apply", radius: Radius.md, height: 44, textStyle: .xsBold, action: onApply)
                .padding(.top, Spacing.s4)
        }
        .padding(Spacing.s5)
        .background(Color.surface)
    }

    private func section<Content: View>(_ title: LocalizedStringKey, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s1_5) {
            Text(title).textStyle(.microCaps).textCase(.uppercase).foregroundStyle(.textMuted)
            content()
        }
    }
}

#Preview("Filters") {
    FilterSheet(filters: .constant(.init(kind: .astrologer, onlineOnly: true, price: .under, rating: .fourPlus,
                                         gender: .any, experience: .fivePlus)), onApply: {})
}
