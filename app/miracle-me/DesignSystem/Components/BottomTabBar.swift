import SwiftUI

enum CustomerTab: CaseIterable, Identifiable {
    case home, chats, wallet, profile

    var id: Self { self }
    var icon: AppIcon {
        switch self {
        case .home: .home
        case .chats: .chat
        case .wallet: .wallet
        case .profile: .user
        }
    }
    var title: LocalizedStringKey {
        switch self {
        case .home: "tab.home"
        case .chats: "tab.chats"
        case .wallet: "tab.wallet"
        case .profile: "tab.profile"
        }
    }
}

struct BottomTabBar: View {
    @Binding var selection: CustomerTab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(CustomerTab.allCases) { tab in
                if tab != CustomerTab.allCases.first { Spacer(minLength: 0) }
                let selected = tab == selection
                Button { selection = tab } label: {
                    VStack(spacing: Spacing.s0_5) {
                        Icon(tab.icon, size: 20)
                        Text(tab.title).textStyle(selected ? .nanoBold : .nanoMedium)
                    }
                    .foregroundStyle(selected ? Color.brandIndigo : Color.textMuted)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(.horizontal, Spacing.s6)
        .frame(height: 56)
        .background(Color.surface.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Rectangle().fill(Color.brandBorder).frame(height: BorderWidth.hairline) }
    }
}
