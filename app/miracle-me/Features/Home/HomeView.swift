import SwiftUI

/// C-04 — home feed (content only; the tab bar lives in `CustomerTabShell`).
struct HomeView: View {
    let balanceText: String
    let experts: [Expert]
    let onSearch: () -> Void
    var onOpenExpert: (Expert) -> Void = { _ in }

    @State private var tab: HomeTab = .all
    @State private var query = ""

    enum HomeTab { case all, astrologers, listeners }

    private var visibleExperts: [Expert] {
        switch tab {
        case .all: experts
        case .astrologers: experts.filter { $0.kind == .astrologer }
        case .listeners: experts.filter { $0.kind == .listener }
        }
    }
    private var onlineNow: [Expert] { visibleExperts.filter { $0.status == .online } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                topBar
                searchEntry
                welcomeBanner
                UnderlineTabs(tabs: [.init(value: .all, title: "home.tab.all"),
                                     .init(value: .astrologers, title: "home.tab.astrologers"),
                                     .init(value: .listeners, title: "home.tab.listeners")],
                              selection: $tab)
                categoryChips
                onlineNowRow
                VStack(spacing: Spacing.s2) {
                    ForEach(visibleExperts) { expert in
                        ExpertCard(expert: expert, onChat: { onOpenExpert(expert) }, onCall: { onOpenExpert(expert) }, onNotify: {})
                            .contentShape(Rectangle())
                            .onTapGesture { onOpenExpert(expert) }
                    }
                }
                .padding(.bottom, Spacing.s2)
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s4)
        }
        .scrollIndicators(.hidden)
        .background(Color.brandBackground)
    }

    private var topBar: some View {
        HStack {
            HStack(spacing: Spacing.s2) {
                Text(verbatim: "M")
                    .textStyle(.field, script: .latin)
                    .foregroundStyle(.brandSaffron)
                    .frame(width: 28, height: 28)
                    .background(Color.brandIndigo, in: RoundedRectangle(cornerRadius: Radius.xs))
                Text(verbatim: "Miracle Me").textStyle(.field, script: .latin).foregroundStyle(.brandIndigo)
            }
            Spacer(minLength: 0)
            HStack(spacing: Spacing.s2) {
                HStack(spacing: Spacing.s1) {
                    Text(verbatim: balanceText).foregroundStyle(.brandIndigo)
                    Text(verbatim: "+").foregroundStyle(.brandSaffron)
                }
                .textStyle(.xsBold)
                .padding(.horizontal, Spacing.s2_5)
                .padding(.vertical, Spacing.s1)
                .background(Color.surfaceLavender, in: Capsule())
                .overlay(Capsule().strokeBorder(Color.borderLavender, lineWidth: BorderWidth.hairline))
                Button {} label: {
                    Icon(.bellOutline, size: 16).foregroundStyle(.brandIndigo)
                        .frame(width: 32, height: 32)
                        .background(Color.surface, in: Circle())
                        .overlay(Circle().strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
                }
                .accessibilityLabel("Notifications")
            }
        }
    }

    /// Tapping the home search bar opens C-05.
    private var searchEntry: some View {
        Button(action: onSearch) {
            SearchField(text: $query).allowsHitTesting(false)
        }
        .buttonStyle(.plain)
    }

    private var welcomeBanner: some View {
        VStack(alignment: .leading, spacing: Spacing.s0_5) {
            Text("home.welcome").textStyle(.nanoCaps).textCase(.uppercase).foregroundStyle(.textOnIndigoMuted)
            Text("home.freeMinutes").textStyle(.xsSemibold).foregroundStyle(.white)
        }
        .padding(Spacing.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.brandIndigo, in: RoundedRectangle(cornerRadius: Radius.md))
        .elevationSm()
    }

    private var categoryChips: some View {
        ScrollView(.horizontal) {
            HStack(spacing: Spacing.s1_5) {
                ChoiceChip(title: "category.career", size: .category)
                ChoiceChip(title: "category.love", size: .category)
                ChoiceChip(title: "category.health", size: .category)
                ChoiceChip(title: "category.family", size: .category)
            }
        }
        .scrollIndicators(.hidden)
    }

    private var onlineNowRow: some View {
        VStack(alignment: .leading, spacing: Spacing.s1_5) {
            HStack {
                Text("home.onlineNow").textStyle(.xsBold).foregroundStyle(.brandIndigo)
                Spacer(minLength: 0)
                Button {} label: {
                    Text("home.seeAll").textStyle(.microSemibold).foregroundStyle(.brandSaffron)
                }
            }
            ScrollView(.horizontal) {
                HStack(spacing: Spacing.s2) {
                    ForEach(onlineNow) { expert in CompactExpertCard(expert: expert, onTalk: { onOpenExpert(expert) }) }
                }
            }
            .scrollIndicators(.hidden)
        }
    }
}

#Preview("Home") {
    VStack(spacing: 0) {
        HomeView(balanceText: "₹150", experts: Expert.samples, onSearch: {})
        BottomTabBar(selection: .constant(.home))
    }
}
