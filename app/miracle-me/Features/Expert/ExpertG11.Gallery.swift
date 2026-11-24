import SwiftUI

/// Debug gallery entries for this group. Launch one with: `-galleryScreen <key>`.
enum ExpertGalleryG11 {
    @MainActor static let screens: [String: () -> AnyView] = [
        "e06": { AnyView(frame(ExpertChatInboxView(threads: ExpertInboxThread.samples, totalCount: 18, unreadCount: 2))) },
        "e07": { AnyView(RecordHost()) },
        "e08": { AnyView(frame(ExpertEarningsDashboardView(summary: .sample))) },
        "e09": { AnyView(ExpertSessionHistoryView(days: ExpertHistoryDay.samples)) },
        "e10": { AnyView(WithdrawHost()) },
    ]

    /// Stand-in for the expert tab bar the shell provides.
    private static func frame<V: View>(_ content: V) -> some View {
        VStack(spacing: 0) {
            content
            Color.surface.frame(height: 56).overlay(alignment: .top) { Rectangle().fill(Color.brandBorder).frame(height: 1) }
        }
    }

    private struct RecordHost: View {
        @State private var draft = ""
        var body: some View {
            ExpertConsultationRecordView(customer: .sample, items: ExpertRecordItem.samples, draft: $draft)
        }
    }

    private struct WithdrawHost: View {
        @State private var amount = "4,000"
        var body: some View {
            ExpertWithdrawView(available: 4820, dailyLimit: 25000, minimum: 500, bank: .sample, amountText: $amount)
        }
    }
}
