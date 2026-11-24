import SwiftUI

/// One conversation row in the expert's inbox.
struct ExpertInboxThread: Identifiable, Hashable {
    enum Meta: Hashable { case text(String), rating(Double) }
    enum Status: Hashable { case replyNeeded, completed, none }

    let id: String
    let initials: String
    var tone: G11Avatar.Tone = .indigo
    var isOnline = false
    let name: String
    let time: String
    var isUnread = false
    let tag: String
    let meta: Meta
    let preview: String
    var previewIsEmphasised = false
    /// Display amount, e.g. "₹224.00".
    var earned: String?
    var status: Status = .none
    var isArchived = false
}

/// E-06 — consultations & chats inbox. Content only; the expert tab bar lives in the shell.
struct ExpertChatInboxView: View {
    let threads: [ExpertInboxThread]
    var totalCount: Int
    var unreadCount: Int
    var onSearch: () -> Void = {}
    var onOpen: (ExpertInboxThread) -> Void = { _ in }

    enum Filter { case all, unread, followUp }
    @State private var filter: Filter = .all

    private var visible: [ExpertInboxThread] {
        switch filter {
        case .all: threads
        case .unread: threads.filter(\.isUnread)
        case .followUp: threads.filter { $0.status == .replyNeeded }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            filters
            notice
            ScrollView {
                VStack(spacing: Spacing.s2) {
                    ForEach(visible) { thread in
                        ThreadCard(thread: thread).onTapGesture { onOpen(thread) }
                    }
                }
                .padding(.horizontal, Spacing.s3)
                .padding(.vertical, Spacing.s2)
            }
            .scrollIndicators(.hidden)
        }
        .background(Color.brandBackground.ignoresSafeArea())
    }

    private var topBar: some View {
        G11Bar(edge: .top) {
            HStack {
                Text("e.g11.inbox.title").textStyle(.g11Title).foregroundStyle(.brandIndigo)
                Spacer(minLength: 0)
                Button(action: onSearch) {
                    G11Icon("Search", size: 16).foregroundStyle(.brandIndigo)
                        .frame(width: 32, height: 32)
                        .background(Color.brandBackground, in: Circle())
                }
                .accessibilityLabel("Search")
            }
            .padding(.horizontal, Spacing.s4).padding(.top, Spacing.s4).padding(.bottom, Spacing.s3)
        }
    }

    private var filters: some View {
        G11Bar(edge: .bottom) {
            HStack(spacing: Spacing.s2) {
                G11Pill(title: "All (\(totalCount))", isSelected: filter == .all) { filter = .all }
                G11Pill(title: "Unread (\(unreadCount))", isSelected: filter == .unread) { filter = .unread }
                G11Pill(title: "Follow-up Due", isSelected: filter == .followUp) { filter = .followUp }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Spacing.s4).padding(.vertical, Spacing.s2)
        }
    }

    private var notice: some View {
        HStack(spacing: Spacing.s2) {
            G11Icon("Info", size: 16).foregroundStyle(.brandSaffron)
            Text("e.g11.inbox.notice").textStyle(.xs).foregroundStyle(Color.g11Amber900)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Spacing.s3).padding(.vertical, Spacing.s2)
        .background(Color.g11Amber50, in: RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.g11Amber200, lineWidth: BorderWidth.hairline))
        .padding(.horizontal, Spacing.s3).padding(.top, Spacing.s3)
    }
}

private struct ThreadCard: View {
    let thread: ExpertInboxThread

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: Spacing.s3) {
                G11Avatar(initials: thread.initials, tone: thread.tone, showsOnline: thread.isOnline)
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Text(verbatim: thread.name).textStyle(.g11SmBold).foregroundStyle(Color.g11Slate900).lineLimit(1)
                        Spacer(minLength: Spacing.s2)
                        Text(verbatim: thread.time)
                            .textStyle(thread.isUnread ? TextStyle.micro.weight(.bold) : .micro)
                            .foregroundStyle(thread.isUnread ? Color.brandSaffron : Color.g11Slate400)
                    }
                    HStack(spacing: Spacing.s1_5) {
                        G11Tag(text: thread.tag)
                        Text(verbatim: "•")
                        switch thread.meta {
                        case .text(let text): Text(verbatim: text)
                        case .rating(let value):
                            Text(verbatim: "★ \(String(format: "%.1f", value)) Rating")
                                .textStyle(.microSemibold).foregroundStyle(Color.g11Amber600)
                        }
                    }
                    .textStyle(.micro).foregroundStyle(Color.g11Slate500)
                    .padding(.top, Spacing.s0_5)
                    Text(verbatim: thread.preview)
                        .textStyle(thread.previewIsEmphasised ? .xsMedium : .xs)
                        .foregroundStyle(thread.previewIsEmphasised ? Color.g11Slate800 : Color.g11Slate500)
                        .lineLimit(1)
                        .padding(.top, Spacing.s1)
                }
            }
            if let earned = thread.earned { footer(earned) }
        }
        .padding(Spacing.s3)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
        .shadow(color: .black.opacity(thread.isArchived ? 0 : 0.05), radius: 1, y: 1)
        .opacity(thread.isArchived ? 0.8 : 1)
        .contentShape(Rectangle())
    }

    private func footer(_ earned: String) -> some View {
        let active = thread.status == .replyNeeded
        return HStack {
            if active {
                HStack(spacing: Spacing.s1) {
                    Circle().fill(Color.g11Emerald600).frame(width: 6, height: 6)
                    Text(verbatim: "Earned \(earned)")
                }
                .textStyle(.microSemibold).foregroundStyle(Color.g11Emerald700)
            } else {
                Text(verbatim: "Earned \(earned)").textStyle(.microMedium).foregroundStyle(Color.g11Slate500)
            }
            Spacer(minLength: 0)
            switch thread.status {
            case .replyNeeded:
                Text("e.g11.inbox.replyNeeded").textStyle(.nanoBold).foregroundStyle(.white)
                    .padding(.horizontal, Spacing.s2).padding(.vertical, Spacing.s0_5)
                    .background(Color.brandSaffron, in: Capsule())
            case .completed:
                Text("e.g11.inbox.completed").textStyle(.micro).foregroundStyle(Color.g11Slate400)
            case .none: EmptyView()
            }
        }
        .padding(.top, Spacing.s2)
        .overlay(alignment: .top) { Rectangle().fill(Color.g11Slate100).frame(height: BorderWidth.hairline) }
        .padding(.top, active ? Spacing.s2_5 : Spacing.s2)
    }
}

extension ExpertInboxThread {
    static let samples: [ExpertInboxThread] = [
        .init(id: "1", initials: "RS", isOnline: true, name: "Rahul Sharma", time: "11:34 AM", isUnread: true,
              tag: "Kundli Career", meta: .text("14m audio session"),
              preview: "Pranam Guru ji, should I perform the Shani remedy on Saturday morning?", previewIsEmphasised: true,
              earned: "₹224.00", status: .replyNeeded),
        .init(id: "2", initials: "PK", tone: .purple, name: "Pooja Kulkarni", time: "Yesterday",
              tag: "Marriage Match", meta: .text("22m chat"),
              preview: "You: I have shared the Gun Milan PDF and recommended gemstone guidelines.",
              earned: "₹352.00", status: .completed),
        .init(id: "3", initials: "AV", tone: .amber, name: "Amit Verma", time: "12 Oct",
              tag: "Vedic Query", meta: .rating(5.0), preview: "Customer rated: \"Very peaceful and accurate prediction.\""),
        .init(id: "4", initials: "SM", tone: .slate, name: "Sunita Mehta", time: "08 Oct",
              tag: "Audio Call", meta: .text("10m consultation"),
              preview: "Consultation completed. Session notes saved.", isArchived: true),
    ]
}

#Preview("E-06 Inbox") {
    VStack(spacing: 0) {
        ExpertChatInboxView(threads: ExpertInboxThread.samples, totalCount: 18, unreadCount: 2)
        Color.surface.frame(height: 56)
    }
}
