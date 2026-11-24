import SwiftUI

/// Expert app container: tab shell plus the full-screen flows opened from the tabs.
/// Screens are UI-only for now and show sample data; backend wiring comes next.
struct ExpertRoot: View {
    private enum Route: String, Identifiable {
        case record, withdraw, history, payouts, bank
        var id: String { rawValue }
    }

    let onSignOut: () -> Void

    @State private var tab: ExpertTab = .home
    @State private var route: Route?
    @State private var draft = ""
    @State private var amount = "4,000"

    var body: some View {
        ExpertTabShell(selection: $tab) {
            ExpertHomeView(isOnline: false)
        } chats: {
            ExpertChatInboxView(threads: ExpertInboxThread.samples, totalCount: 18, unreadCount: 2,
                                onOpen: { _ in route = .record })
        } earnings: {
            ExpertEarningsDashboardView(summary: .sample, onWithdraw: { route = .withdraw },
                                        onChangeBank: { route = .bank },
                                        onOpenHistory: { route = .history }, onOpenPayouts: { route = .payouts })
        } profile: {
            // The profile screen's back arrow doubles as sign-out until Settings is reachable.
            ExpertProfileEditView(profile: .sample, onBack: onSignOut)
        }
        .fullScreenCover(item: $route) { route in
            switch route {
            case .record:
                ExpertConsultationRecordView(customer: .sample, items: ExpertRecordItem.samples, draft: $draft,
                                             onBack: { self.route = nil })
            case .withdraw:
                ExpertWithdrawView(available: 4820, dailyLimit: 25000, minimum: 500, bank: .sample, amountText: $amount,
                                   onBack: { self.route = nil }, onHistory: { self.route = .payouts },
                                   onAddBank: { self.route = .bank }, onConfirm: { _ in self.route = nil })
            case .history:
                ExpertSessionHistoryView(days: ExpertHistoryDay.samples, onBack: { self.route = nil })
            case .payouts:
                ExpertWithdrawalHistoryView(records: WithdrawalRecord.samples, onBack: { self.route = nil })
            case .bank:
                ExpertBankAccountsView(primary: .sample, draft: .sample, onBack: { self.route = nil })
            }
        }
    }
}
