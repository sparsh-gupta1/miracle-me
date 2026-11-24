import SwiftUI

/// C-05 — search results with quick filters and a filter sheet.
struct SearchResultsView: View {
    enum QuickFilter: Hashable { case onlineNow, underPrice, english }

    @Binding var query: String
    @Binding var filters: ExpertFilters
    @Binding var quickFilters: Set<QuickFilter>
    let results: [Expert]
    let onBack: () -> Void
    var onOpenExpert: (Expert) -> Void = { _ in }

    @State private var showsFilters = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                searchRow
                quickFilterRow
                RichText(key: "search.results", args: [String(results.count)]).textStyle(.microSemibold).foregroundStyle(.textMuted)
                VStack(spacing: Spacing.s3) {
                    ForEach(results) { expert in
                        ExpertCard(expert: expert, style: .search, onChat: { onOpenExpert(expert) }, onCall: { onOpenExpert(expert) })
                            .contentShape(Rectangle())
                            .onTapGesture { onOpenExpert(expert) }
                    }
                }
            }
            .padding(Spacing.s4)
        }
        .scrollIndicators(.hidden)
        .background(Color.brandBackground.ignoresSafeArea())
        .sheet(isPresented: $showsFilters) {
            FilterSheet(filters: $filters) { showsFilters = false }
                .presentationDetents([.large])
                .presentationCornerRadius(20)
                .presentationBackground(Color.surface)
        }
    }

    private var searchRow: some View {
        HStack(spacing: Spacing.s2) {
            Button(action: onBack) {
                Icon(.chevronLeftSm, size: 20).foregroundStyle(.brandIndigo).frame(width: 32, height: 32)
            }
            .accessibilityLabel("Back")
            SearchField(text: $query, placeholder: "", showsIcon: false, style: .xsSemibold)
            Button { showsFilters = true } label: {
                Icon(.sliders, size: 16).foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(Color.brandIndigo, in: RoundedRectangle(cornerRadius: Radius.md))
            }
            .accessibilityLabel("Filters")
        }
    }

    private var quickFilterRow: some View {
        HStack(spacing: Spacing.s1_5) {
            chip("Online now", .onlineNow)
            chip("Under ₹\(PriceBands.low)", .underPrice)
            chip("English", .english)
        }
    }

    private func chip(_ title: LocalizedStringKey, _ filter: QuickFilter) -> some View {
        ChoiceChip(title: title, isSelected: quickFilters.contains(filter), size: .tag) {
            if quickFilters.contains(filter) { quickFilters.remove(filter) } else { quickFilters.insert(filter) }
        }
    }
}

#Preview("Results") {
    SearchResultsView(query: .constant("Tarot"), filters: .constant(.init()), quickFilters: .constant([.onlineNow]),
                      results: Array(Expert.samples.suffix(3).filter { $0.specialty.hasPrefix("Tarot") }), onBack: {})
}
