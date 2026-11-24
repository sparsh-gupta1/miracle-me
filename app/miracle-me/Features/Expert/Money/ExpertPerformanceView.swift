import SwiftUI

struct PerformanceStat: Identifiable, Hashable {
    let id: String
    let label: String
    let value: String
    let caption: String
    var isNegative = false
}

struct PenaltyEntry: Identifiable, Hashable {
    let id: String
    let reason: String
    /// "12 Oct, 6:40 PM · Customer R."
    let detail: String
    let amountText: String
}

struct PerformanceSummary: Hashable {
    let ratingText: String
    let reviewCount: Int
    /// Right-hand breakdown lines, e.g. "5★ 85%".
    let distribution: [String]
    let stats: [PerformanceStat]
    let penalties: [PenaltyEntry]
}

/// E-13 — performance & penalties.
struct ExpertPerformanceView: View {
    enum Period { case month, week }

    let summary: PerformanceSummary
    var onBack: () -> Void = {}
    var onHelp: () -> Void = {}
    var onContactSupport: () -> Void = {}

    @State private var period: Period = .month

    var body: some View {
        G12Screen {
            G12Header(title: "e.g12.perf.title", onBack: onBack) {
                G12IconButton(icon: "IconG12HelpCircle", size: 18, label: "Help", action: onHelp)
            }
        } content: {
            ratingCard
            LazyVGrid(columns: [GridItem(.flexible(), spacing: Spacing.s2_5), GridItem(.flexible())], spacing: Spacing.s2_5) {
                ForEach(summary.stats) { stat in statCard(stat) }
            }
            penaltiesCard
            tipsCard
        }
    }

    private var ratingCard: some View {
        HStack {
            VStack(alignment: .leading, spacing: 0) {
                Text("e.g12.perf.yourRating").textStyle(.g12Label105).foregroundStyle(.g12OnIndigoMuted)
                    .textCase(.uppercase).tracking(0.55)
                HStack(alignment: .firstTextBaseline, spacing: Spacing.s1) {
                    Text(verbatim: "\(summary.ratingText) ★").textStyle(.g12Hero).foregroundStyle(.white)
                    Text("e.g12.perf.reviews \(summary.reviewCount)").textStyle(.xsMedium).foregroundStyle(.g12OnIndigoMuted)
                }
            }
            Spacer(minLength: Spacing.s2)
            VStack(alignment: .trailing, spacing: 0) {
                ForEach(summary.distribution, id: \.self) { line in
                    Text(verbatim: line).textStyle(.g12Para11Wide).foregroundStyle(.g12OnIndigoMuted)
                }
            }
        }
        .padding(.horizontal, Spacing.s4).padding(.vertical, 18)
        .frame(maxWidth: .infinity)
        .background(LinearGradient(colors: [.brandIndigo, .g12HighlightEnd], startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: Radius.lg))
        .shadow(color: Color.brandIndigo.opacity(0.15), radius: 8, y: 4)
    }

    private func statCard(_ stat: PerformanceStat) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(verbatim: stat.label).textStyle(.g12Label105).foregroundStyle(.g12Muted)
            Text(verbatim: stat.value).textStyle(.g12Stat)
                .foregroundStyle(stat.isNegative ? Color.g12Red : Color.brandIndigo)
                .padding(.vertical, Spacing.s1)
            Text(verbatim: stat.caption).textStyle(.g12Nano).foregroundStyle(.g12Muted)
        }
        .g12Card(padding: Spacing.s3)
    }

    private var penaltiesCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("e.g12.perf.penalties").textStyle(.g12Sec13).foregroundStyle(.brandIndigo)
                Spacer(minLength: Spacing.s2)
                HStack(spacing: Spacing.s1_5) {
                    G12Pill(title: "e.g12.perf.thisMonth", isActive: period == .month, horizontal: 10, vertical: 4) { period = .month }
                    G12Pill(title: "e.g12.perf.thisWeek", isActive: period == .week, horizontal: 10, vertical: 4) { period = .week }
                }
            }
            .padding(.bottom, Spacing.s2)
            VStack(spacing: 0) {
                ForEach(Array(summary.penalties.enumerated()), id: \.element.id) { index, entry in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(verbatim: entry.reason).textStyle(.g12Item125).foregroundStyle(.brandIndigo)
                            Text(verbatim: entry.detail).textStyle(.g12Meta).foregroundStyle(.g12Muted)
                        }
                        Spacer(minLength: Spacing.s2)
                        Text(verbatim: entry.amountText).textStyle(.g12Item13).foregroundStyle(.g12Red)
                    }
                    .padding(.vertical, Spacing.s3)
                    .overlay(alignment: .bottom) {
                        if index < summary.penalties.count - 1 { Rectangle().fill(Color.g12Divider).frame(height: BorderWidth.hairline) }
                    }
                }
            }
            Text("e.g12.perf.penaltyNote").textStyle(.g12Caption105).foregroundStyle(.g12Muted)
                .padding(.top, Spacing.s2_5)
        }
        .g12Card()
    }

    private var tipsCard: some View {
        VStack(alignment: .leading, spacing: Spacing.s1_5) {
            Text("e.g12.perf.tipsTitle").textStyle(.g12Sec13).foregroundStyle(.brandIndigo)
            Text("e.g12.perf.tips").textStyle(.g12Para115).foregroundStyle(.g12Body)
            G12SupportLine(prefix: "e.g12.perf.wrongPenalty", link: "e.g12.contactSupport", action: onContactSupport)
                .padding(.top, Spacing.s1)
        }
        .g12Card()
    }
}

extension PerformanceSummary {
    static let sample = PerformanceSummary(
        ratingText: "4.9", reviewCount: 48, distribution: ["5★ 85%", "4★ 11%", "1–3★ 4%"],
        stats: [
            .init(id: "missed", label: "Missed requests", value: "1 today", caption: "3 this week"),
            .init(id: "reply", label: "Average reply time", value: "12 sec", caption: "Chat, last 7 days"),
            .init(id: "pickup", label: "Call pickup rate", value: "96%", caption: "Last 7 days"),
            .init(id: "penalties", label: "Penalties this month", value: "−₹30", caption: "3 late replies", isNegative: true),
        ],
        penalties: [
            .init(id: "p1", reason: "Late reply", detail: "12 Oct, 6:40 PM · Customer R.", amountText: "−₹10"),
            .init(id: "p2", reason: "Late reply", detail: "09 Oct, 9:15 PM · Customer A.", amountText: "−₹10"),
            .init(id: "p3", reason: "Late reply", detail: "03 Oct, 11:02 AM · Customer S.", amountText: "−₹10"),
        ])
}

#Preview("E-13 Performance") { ExpertPerformanceView(summary: .sample) }
