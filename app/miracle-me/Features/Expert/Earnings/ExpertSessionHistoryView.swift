import SwiftUI

/// One settled consultation in the history list.
struct ExpertHistorySession: Identifiable, Hashable {
    enum Mode: Hashable { case audio, chat, video }
    struct Breakdown: Hashable { let text: String }

    let id: String
    let initials: String
    var tone: G11Avatar.Tone = .indigo
    let name: String
    /// "Audio Consultation • 11:30 AM"
    let subtitle: String
    let mode: Mode
    /// "+₹224.00"
    let net: String
    let netCaption: String
    var netCaptionIsPositive = false
    /// Left side of the detail row, with `**bold**` markers around the emphasised part.
    let detail: String
    /// Right side of the detail row ("★ 5.0", "Rated ★ 4.8").
    let rating: String
    var ratingIsStrong = true
    /// "Gross: ₹280.00 • Fee 20%: −₹56.00"
    var breakdown: String?
    var note: String?
}

struct ExpertHistoryDay: Identifiable, Hashable {
    let title: String
    let sessions: [ExpertHistorySession]
    var id: String { title }
}

/// E-09 — itemised session history.
struct ExpertSessionHistoryView: View {
    let days: [ExpertHistoryDay]
    var onBack: () -> Void = {}
    var onFilter: () -> Void = {}
    var onBreakdown: (ExpertHistorySession) -> Void = { _ in }

    @State private var mode: ExpertHistorySession.Mode?

    private func shows(_ session: ExpertHistorySession) -> Bool { mode == nil || session.mode == mode }

    var body: some View {
        VStack(spacing: 0) {
            G11Bar(edge: .top) {
                HStack {
                    HStack(spacing: Spacing.s2) {
                        Button(action: onBack) {
                            G11Icon("ChevronLeft", size: 20).foregroundStyle(Color.g11Slate600).padding(Spacing.s1)
                        }
                        .accessibilityLabel("Back")
                        Text("e.g11.history.title").textStyle(.g11BarTitle).foregroundStyle(.brandIndigo)
                    }
                    Spacer(minLength: 0)
                    Button(action: onFilter) {
                        HStack(spacing: Spacing.s1) {
                            G11Icon("Filter", size: 14)
                            Text("e.g11.history.filter")
                        }
                        .textStyle(.xsBold).foregroundStyle(.brandSaffron)
                    }
                }
                .padding(.horizontal, Spacing.s3).padding(.top, Spacing.s4).padding(.bottom, Spacing.s3)
            }
            G11Bar(edge: .bottom) {
                HStack(spacing: Spacing.s2) {
                    G11Pill(title: "All Modes", isSelected: mode == nil, horizontal: Spacing.s3) { mode = nil }
                    G11Pill(title: "Audio Calls", isSelected: mode == .audio, horizontal: Spacing.s3) { mode = .audio }
                    G11Pill(title: "Chats", isSelected: mode == .chat, horizontal: Spacing.s3) { mode = .chat }
                    G11Pill(title: "Video", isSelected: mode == .video, horizontal: Spacing.s3) { mode = .video }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, Spacing.s4).padding(.vertical, Spacing.s2)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s3) {
                    ForEach(Array(days.enumerated()), id: \.element.id) { index, day in
                        let sessions = day.sessions.filter(shows)
                        if !sessions.isEmpty {
                            Text(verbatim: day.title).textStyle(.g11MicroCaps).textCase(.uppercase)
                                .foregroundStyle(Color.g11Slate500)
                                .padding(.horizontal, Spacing.s1).padding(.top, index == 0 ? 0 : Spacing.s2)
                            ForEach(sessions) { s in SessionCard(session: s, onBreakdown: { onBreakdown(s) }) }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Spacing.s3)
            }
            .scrollIndicators(.hidden)
            G11Bar(edge: .bottom) {
                Text("e.g11.history.footer").textStyle(.micro).foregroundStyle(Color.g11Slate500)
                    .multilineTextAlignment(.center).padding(Spacing.s2_5)
            }
            .overlay(alignment: .top) { Rectangle().fill(Color.brandBorder).frame(height: BorderWidth.hairline) }
        }
        .background(Color.brandBackground.ignoresSafeArea())
    }
}

private struct SessionCard: View {
    let session: ExpertHistorySession
    let onBreakdown: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                HStack(spacing: Spacing.s2_5) {
                    G11Avatar(initials: session.initials, tone: session.tone, size: 36)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(verbatim: session.name).textStyle(.xsBold).foregroundStyle(Color.g11Slate900)
                        Text(verbatim: session.subtitle).textStyle(.micro).foregroundStyle(Color.g11Slate500)
                    }
                }
                Spacer(minLength: Spacing.s2)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(verbatim: session.net).textStyle(.xsBold).foregroundStyle(Color.g11Emerald700)
                    Text(verbatim: session.netCaption)
                        .textStyle(session.netCaptionIsPositive ? .nanoMedium : .g11Nano)
                        .foregroundStyle(session.netCaptionIsPositive ? Color.g11Emerald600 : Color.g11Slate400)
                }
            }
            HStack {
                emphasised(session.detail)
                Spacer(minLength: Spacing.s2)
                Text(verbatim: session.rating)
                    .textStyle(session.ratingIsStrong ? .microSemibold : .micro)
                    .foregroundStyle(session.ratingIsStrong ? Color.g11Amber600 : Color.g11Slate400)
            }
            .textStyle(.micro).foregroundStyle(Color.g11Slate600)
            .padding(.top, Spacing.s2)
            .overlay(alignment: .top) { Rectangle().fill(Color.g11Slate100).frame(height: BorderWidth.hairline) }
            .padding(.top, Spacing.s2_5)
            if let breakdown = session.breakdown {
                HStack {
                    Text(verbatim: breakdown).foregroundStyle(Color.g11Slate500)
                    Spacer(minLength: Spacing.s2)
                    Button(action: onBreakdown) {
                        Text("e.g11.history.breakdown").fontWeight(.bold).foregroundStyle(Color.brandSaffron)
                    }
                    .buttonStyle(.plain)
                }
                .textStyle(.g11Nano)
                .padding(.horizontal, Spacing.s2).padding(.vertical, Spacing.s1)
                .background(Color.g11Slate50, in: RoundedRectangle(cornerRadius: 4))
                .padding(.top, Spacing.s2)
            }
            if let note = session.note {
                Text(verbatim: note).textStyle(.g11Nano.weight(.medium)).foregroundStyle(Color.g11Emerald700)
                    .padding(.horizontal, Spacing.s2).padding(.vertical, Spacing.s0_5)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.g11Emerald50, in: RoundedRectangle(cornerRadius: 4))
                    .padding(.top, Spacing.s1)
            }
        }
        .padding(Spacing.s3)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
        .shadow(color: .black.opacity(0.05), radius: 1, y: 1)
    }

    /// Renders `**bold**` spans.
    private func emphasised(_ text: String) -> Text {
        let parts = text.components(separatedBy: "**")
        return parts.enumerated().reduce(Text(verbatim: "")) { result, item in
            result + (item.offset % 2 == 1 ? Text(verbatim: item.element).fontWeight(.bold) : Text(verbatim: item.element))
        }
    }
}

extension ExpertHistoryDay {
    static let samples: [ExpertHistoryDay] = [
        .init(title: "Today — 14 Oct 2026", sessions: [
            .init(id: "1", initials: "RS", name: "Rahul Sharma", subtitle: "Audio Consultation • 11:30 AM", mode: .audio,
                  net: "+₹224.00", netCaption: "Net Settled", detail: "Duration: **14m 20s**  •  Rate: ₹20/m",
                  rating: "★ 5.0", breakdown: "Gross: ₹280.00 • Fee 20%: −₹56.00"),
            .init(id: "2", initials: "PK", tone: .purple, name: "Pooja Kulkarni", subtitle: "Chat Consultation • 09:15 AM", mode: .chat,
                  net: "+₹320.00", netCaption: "Reimbursed", netCaptionIsPositive: true,
                  detail: "Duration: **20m 00s** (5m User Promo)", rating: "Rated ★ 4.8", ratingIsStrong: false,
                  note: "5 free user minutes reimbursed at full standard rate by Miracle Me."),
        ]),
        .init(title: "12 Oct 2026", sessions: [
            .init(id: "3", initials: "AV", tone: .amber, name: "Amit Verma", subtitle: "Video Call Consultation • 04:30 PM", mode: .video,
                  net: "+₹480.00", netCaption: "Net Settled", detail: "Duration: **15m 00s** @ ₹40/m", rating: "★ 5.0"),
        ]),
    ]
}

#Preview("E-09 History") { ExpertSessionHistoryView(days: ExpertHistoryDay.samples) }
