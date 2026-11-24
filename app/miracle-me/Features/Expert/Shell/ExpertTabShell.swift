import SwiftUI

enum ExpertTab: CaseIterable, Identifiable {
    case home, chats, earnings, profile

    var id: Self { self }

    /// Asset name for the inactive state (outline) and the active state.
    var iconName: String {
        switch self {
        case .home: "IconHome"
        case .chats: "IconChat"
        case .earnings: "IconWallet"
        case .profile: "IconUser"
        }
    }
    var activeIconName: String { self == .home ? "IconG10HomeFilled" : iconName }
    var title: LocalizedStringKey {
        switch self {
        case .home: "e.g10.tab.home"
        case .chats: "e.g10.tab.chats"
        case .earnings: "e.g10.tab.earnings"
        case .profile: "e.g10.tab.profile"
        }
    }
}

/// Expert bottom bar: 64-pt, four tabs, saffron when active.
struct ExpertTabBar: View {
    @Binding var selection: ExpertTab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(ExpertTab.allCases) { tab in
                let selected = tab == selection
                Button { selection = tab } label: {
                    VStack(spacing: 0) {
                        G10Icon(selected ? tab.activeIconName : tab.iconName, size: 22)
                        Text(tab.title).textStyle(selected ? .g10Text11Bold : .g10Text11Medium)
                    }
                    .foregroundStyle(selected ? Color.brandSaffron : Color.g10Inactive)
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(.horizontal, Spacing.s3)
        .frame(height: 64)
        .background(Color.surface.ignoresSafeArea(edges: .bottom))
        .g10Rule(.top)
    }
}

/// Expert-side tab container. Each slot is supplied by the owning feature group.
struct ExpertTabShell<Home: View, Chats: View, Earnings: View, Profile: View>: View {
    @Binding var selection: ExpertTab
    @ViewBuilder var home: Home
    @ViewBuilder var chats: Chats
    @ViewBuilder var earnings: Earnings
    @ViewBuilder var profile: Profile

    var body: some View {
        ZStack {
            switch selection {
            case .home: home
            case .chats: chats
            case .earnings: earnings
            case .profile: profile
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.brandBackground.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) { ExpertTabBar(selection: $selection) }
    }
}

extension ExpertTabShell where Chats == ExpertTabPlaceholder, Earnings == ExpertTabPlaceholder, Profile == ExpertTabPlaceholder {
    /// Home-only shell; the remaining tabs show placeholders until wired.
    init(selection: Binding<ExpertTab>, @ViewBuilder home: () -> Home) {
        self.init(selection: selection, home: home,
                  chats: { ExpertTabPlaceholder(title: "e.g10.tab.chats") },
                  earnings: { ExpertTabPlaceholder(title: "e.g10.tab.earnings") },
                  profile: { ExpertTabPlaceholder(title: "e.g10.tab.profile") })
    }
}

struct ExpertTabPlaceholder: View {
    let title: LocalizedStringKey
    var body: some View {
        Text(title).textStyle(.g10Title18Bold).foregroundStyle(Color.g10Ink)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
