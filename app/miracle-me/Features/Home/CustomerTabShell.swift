import SwiftUI

/// Customer tab container: content above, `BottomTabBar` below.
/// Also hosts the expert-profile → start-session → waiting flow (C-06 to C-09).
struct CustomerTabShell: View {
    private struct SessionRequest: Identifiable {
        let profile: ExpertProfile
        let service: ConsultService
        var quotes: [ConsultService: SessionQuote]
        var id: String { "\(profile.id)-\(service)" }
    }

    private struct Notice: Identifiable {
        let id = UUID()
        let title: LocalizedStringKey
        let message: String
    }

    private struct SearchKey: Hashable {
        let isSearching: Bool
        let query: String
        let filters: ExpertFilters
        let quick: Set<SearchResultsView.QuickFilter>
    }

    @State private var store: CustomerStore
    @State private var tab: CustomerTab = .home
    @State private var isSearching = false
    @State private var query = ""
    @State private var filters = ExpertFilters()
    @State private var quickFilters: Set<SearchResultsView.QuickFilter> = []

    @State private var openProfile: ExpertProfile?
    @State private var sessionRequest: SessionRequest?
    @State private var waiting: SessionRequestModel?
    @State private var notice: Notice?

    let onSignOut: () -> Void

    init(session: AppSession, onSignOut: @escaping () -> Void) {
        _store = State(initialValue: CustomerStore(session: session))
        self.onSignOut = onSignOut
    }

    var body: some View {
        ZStack {
            tabs
            if let profile = openProfile {
                ExpertProfileView(
                    profile: profile,
                    isFavourite: favouriteBinding(profile.id),
                    onBack: { openProfile = nil },
                    onStart: { prepareSession(for: profile, service: $0) })
                .transition(.move(edge: .trailing))
            }
            if let request = waiting {
                WaitingForExpertView(expert: request.expert, service: request.service,
                                     onCancel: { cancel(request) }, onTimeout: { expire(request) })
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: openProfile?.id)
        .sheet(item: $sessionRequest) { request in
            StartSessionSheet(expert: request.profile.expert, rates: request.profile.rates, service: request.service,
                              quotes: request.quotes,
                              onStart: { service, _ in begin(request.profile.expert, service: service) },
                              onRecharge: { amount in recharge(amount, for: request) },
                              onCancel: { sessionRequest = nil })
        }
        .alert(notice?.title ?? "", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(verbatim: notice?.message ?? "")
        }
        .task { await store.refresh() }
        .task(id: SearchKey(isSearching: isSearching, query: query, filters: filters, quick: quickFilters)) {
            guard isSearching else { return }
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await store.search(text: query, filters: filters, quick: quickFilters)
        }
        .onChange(of: tab) { _, new in
            if new == .chats { Task { await store.refreshSessions() } }
            if new == .home { Task { await store.refreshBalance() } }
        }
    }

    // MARK: Tabs

    private var tabs: some View {
        VStack(spacing: 0) {
            Group {
                switch tab {
                case .home: homeContent
                case .chats:
                    ChatsView(activities: store.activities,
                              onCallAgain: openExpert, onChatAgain: openExpert)
                default:
                    // Wallet and Profile aren't built yet. Sign-out lives here so the demo can switch accounts.
                    Color.brandBackground.overlay {
                        VStack(spacing: Spacing.s4) {
                            Text(tab.title).textStyle(.bodyDefault)
                            if tab == .profile { TextButton(title: "Sign out", color: .textSecondary, action: onSignOut) }
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            BottomTabBar(selection: $tab)
        }
        .background(Color.brandBackground.ignoresSafeArea())
    }

    @ViewBuilder private var homeContent: some View {
        if isSearching {
            SearchResultsView(query: $query, filters: $filters, quickFilters: $quickFilters,
                              results: store.searchResults,
                              onBack: { isSearching = false }, onOpenExpert: open)
        } else {
            switch store.load {
            case .failed(let error) where store.experts.isEmpty:
                loadFailure(error)
            case .idle where store.experts.isEmpty, .loading where store.experts.isEmpty:
                Color.brandBackground.overlay { LoadingDots() }
            default:
                HomeView(balanceText: store.balanceText, experts: store.experts, onSearch: { isSearching = true }, onOpenExpert: open)
                    .refreshable { await store.refresh() }
            }
        }
    }

    @ViewBuilder private func loadFailure(_ error: APIError) -> some View {
        if case .server(let status, _) = error {
            ServerErrorView(errorCode: String(status), onBack: {}, onRetry: retry, onOpenHelp: {}, onContactWhatsApp: {})
        } else {
            NoInternetView(onBack: {}, onRetry: retry, onOpenSettings: openSettings)
        }
    }

    private func retry() { Task { await store.refresh() } }

    private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
    }

    // MARK: Expert profile

    private func open(_ expert: Expert) {
        guard let provisional = store.provisionalProfile(for: expert) else { return }
        openProfile = provisional
        Task {
            if let full = await store.fullProfile(for: expert), openProfile?.id == full.id { openProfile = full }
        }
    }

    /// "Chat again" / "Call again" from the Chats tab.
    private func openExpert(_ expert: Expert) {
        tab = .home
        open(expert)
    }

    private func favouriteBinding(_ id: String) -> Binding<Bool> {
        Binding(get: { store.favouriteIDs.contains(id) },
                set: { value in Task { await store.setFavourite(id, value) } })
    }

    // MARK: Session

    private func prepareSession(for profile: ExpertProfile, service: ConsultService) {
        Task {
            await store.refreshBalance()
            let quotes = await store.quotes(for: profile)
            guard !quotes.isEmpty else {
                notice = Notice(title: "Couldn't load pricing", message: "Please check your connection and try again.")
                return
            }
            // The tapped service may be the one whose quote failed: fall back to one that loaded.
            let usable = quotes[service] != nil ? service : (profile.rates.map(\.service).first { quotes[$0] != nil } ?? service)
            sessionRequest = SessionRequest(profile: profile, service: usable, quotes: quotes)
        }
    }

    private func recharge(_ amount: Int, for request: SessionRequest) {
        Task {
            guard await store.recharge(amount: amount) else {
                notice = Notice(title: "Recharge failed", message: "Couldn't add money right now. Please try again.")
                return
            }
            var updated = request
            updated.quotes = await store.quotes(for: request.profile)
            sessionRequest = updated
        }
    }

    private func begin(_ expert: Expert, service: ConsultService) {
        guard waiting == nil else { return }   // a second tap must not send a second request
        sessionRequest = nil
        let request = store.makeRequest(expert: expert, service: service)
        waiting = request
        Task { finish(request, await request.run()) }
    }

    private func cancel(_ request: SessionRequestModel) {
        request.cancel()
        if waiting === request { waiting = nil }
    }

    /// The local countdown ran out. The server normally reports the timeout itself; this is the fallback.
    private func expire(_ request: SessionRequestModel) {
        Task {
            try? await Task.sleep(for: .seconds(3))
            guard waiting === request else { return }
            request.cancel()
            finish(request, .timedOut)
        }
    }

    private func finish(_ request: SessionRequestModel, _ outcome: SessionRequestModel.Outcome) {
        guard waiting === request else { return }
        waiting = nil
        let name = request.expert.name
        switch outcome {
        case .accepted:
            openProfile = nil
            tab = .chats
            Task { await store.refreshSessions(); await store.refreshBalance() }
        case .rejected:
            notice = Notice(title: "Request declined", message: "\(name) can't take your request right now. Try again in a bit.")
        case .timedOut:
            notice = Notice(title: "No response", message: "\(name) didn't respond in time. You weren't charged.")
        case .failed(let message):
            notice = Notice(title: "Couldn't start the session", message: message)
        case .cancelled:
            break
        }
    }
}
