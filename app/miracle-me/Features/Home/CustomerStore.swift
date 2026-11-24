import Foundation
import Observation

/// Everything the signed-in customer's tabs show, loaded from the backend.
@Observable
@MainActor
final class CustomerStore {
    enum Load: Equatable { case idle, loading, loaded, failed(APIError) }

    private let session: AppSession
    private var api: MiracleAPI { session.api }
    private var listings: [String: ExpertDTO] = [:]

    private(set) var load: Load = .idle
    private(set) var experts: [Expert] = []
    private(set) var searchResults: [Expert] = []
    private(set) var balance: Double = 0
    private(set) var activities: [ChatActivity] = []
    var favouriteIDs: Set<String> = []

    var socket: SocketClient { session.socket }
    var balanceText: String { "₹\(PriceFormat.amount(balance))" }

    init(session: AppSession) { self.session = session }

    // MARK: Loading

    /// Loads home content. Experts are required; wallet and sessions degrade quietly.
    func refresh() async {
        if experts.isEmpty { load = .loading }
        async let wallet: Void = refreshBalance()
        async let sessions: Void = refreshSessions()
        do {
            let page = try await api.experts()
            absorb(page.experts)
            experts = page.experts.map(Expert.init(dto:))
            load = .loaded
        } catch let error as APIError {
            load = .failed(error)
        } catch {
            load = .failed(.network)
        }
        _ = await (wallet, sessions)
    }

    func refreshBalance() async {
        if let value = try? await api.balance() { balance = value }
    }

    func refreshSessions() async {
        guard let dto = try? await api.sessions() else { return }
        absorb(dto.active.map(\.expert) + dto.threads.map(\.expert) + dto.past.map(\.expert))
        activities = ChatActivity.make(from: dto)
    }

    func search(text: String, filters: ExpertFilters, quick: Set<SearchResultsView.QuickFilter>) async {
        do {
            let page = try await api.experts(filters.query(text: text, quick: quick))
            guard !Task.isCancelled else { return }
            absorb(page.experts)
            searchResults = page.experts.map(Expert.init(dto:))
        } catch {
            // Keep the previous results; a transient failure shouldn't blank the screen.
        }
    }

    // MARK: Expert profile

    /// The profile from what the list already knows, so the screen opens instantly.
    func provisionalProfile(for expert: Expert) -> ExpertProfile? {
        listings[expert.id].map(ExpertProfile.init(listing:))
    }

    /// The full profile (about, specialities, review, free minutes).
    func fullProfile(for expert: Expert) async -> ExpertProfile? {
        guard let detail = try? await api.expert(id: expert.id) else { return nil }
        absorb([detail.expert])
        return ExpertProfile(detail: detail)
    }

    func setFavourite(_ id: String, _ isFavourite: Bool) async {
        let was = favouriteIDs.contains(id)
        guard was != isFavourite else { return }
        if isFavourite { favouriteIDs.insert(id) } else { favouriteIDs.remove(id) }
        do {
            let confirmed = try await api.toggleFavourite(expertID: id)
            if confirmed { favouriteIDs.insert(id) } else { favouriteIDs.remove(id) }
        } catch {
            if was { favouriteIDs.insert(id) } else { favouriteIDs.remove(id) }
        }
    }

    // MARK: Session

    /// Quotes for every service the expert offers, keyed by service.
    func quotes(for profile: ExpertProfile) async -> [ConsultService: SessionQuote] {
        await withTaskGroup(of: (ConsultService, SessionQuote?).self) { group in
            for rate in profile.rates {
                group.addTask { [api] in
                    let dto = try? await api.quote(expertID: profile.id, service: rate.service.apiName)
                    return (rate.service, dto.map(SessionQuote.init(dto:)))
                }
            }
            var result: [ConsultService: SessionQuote] = [:]
            for await (service, quote) in group { if let quote { result[service] = quote } }
            return result
        }
    }

    /// Adds money to the wallet. Demo only: the payment gateway isn't wired yet.
    func recharge(amount: Int) async -> Bool {
        guard let value = try? await api.demoTopUp(amount: amount) else { return false }
        balance = value
        return true
    }

    func makeRequest(expert: Expert, service: ConsultService) -> SessionRequestModel {
        SessionRequestModel(expert: expert, service: service, socket: session.socket)
    }

    // MARK: Helpers

    private func absorb(_ dtos: [ExpertDTO]) {
        for dto in dtos {
            listings[dto.id] = dto
            if dto.isFavorite == true { favouriteIDs.insert(dto.id) } else if dto.isFavorite == false { favouriteIDs.remove(dto.id) }
        }
    }
}

// MARK: Sessions → Chats rows

extension ChatActivity {
    static func make(from dto: SessionsDTO) -> [ChatActivity] {
        let active = dto.active.map { item -> ChatActivity in
            .active(.init(expert: Expert(dto: item.expert), elapsed: clock(item.elapsedSeconds),
                          remaining: item.remainingSeconds.map { "\(max($0 / 60, 0))m remaining" } ?? ""))
        }
        let threads = dto.threads.map { item -> ChatActivity in
            .thread(.init(expert: Expert(dto: item.expert), time: item.lastMessageAt.map(shortTime) ?? "",
                          preview: item.lastMessage ?? "", unread: item.unreadCount))
        }
        let past = dto.past.map { item -> ChatActivity in
            .past(.init(expert: Expert(dto: item.expert), kind: item.serviceType == "chat" ? .chat : .call,
                        minutes: item.durationMinutes, when: item.endedAt.map(pastTime) ?? ""))
        }
        return active + threads + past
    }

    private static func clock(_ seconds: Int) -> String { String(format: "%02d:%02d", seconds / 60, seconds % 60) }

    private static func shortTime(_ date: Date) -> String {
        Calendar.current.isDateInToday(date)
            ? date.formatted(.dateTime.hour().minute())
            : date.formatted(.dateTime.day().month(.abbreviated))
    }

    private static func pastTime(_ date: Date) -> String {
        let time = date.formatted(.dateTime.hour().minute())
        if Calendar.current.isDateInToday(date) { return "Today, \(time)" }
        if Calendar.current.isDateInYesterday(date) { return "Yesterday, \(time)" }
        return date.formatted(.dateTime.day().month(.abbreviated)) + ", " + time
    }
}
