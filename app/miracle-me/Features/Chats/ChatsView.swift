import SwiftUI

/// One row of the Chats & Calls list.
enum ChatActivity: Identifiable {
    struct Active { let expert: Expert; let elapsed: String; let remaining: String }
    struct Thread { let expert: Expert; let time: String; let preview: String; let unread: Int }
    struct Past {
        enum Kind { case call, chat }
        let expert: Expert; let kind: Kind; let minutes: Int; let when: String
    }

    case active(Active)
    case thread(Thread)
    case past(Past)

    var id: String {
        switch self {
        case .active(let a): "active-\(a.expert.id)"
        case .thread(let t): "thread-\(t.expert.id)"
        case .past(let p): "past-\(p.expert.id)-\(p.when)"
        }
    }
}

extension ChatActivity {
    static var samples: [ChatActivity] {
        var ramesh = Expert.samples[1]; ramesh.status = .offline
        var keshavPast = Expert.samples[0]; keshavPast.tint = .peach
        return [
            .active(.init(expert: Expert.samples[0], elapsed: "04:12", remaining: "11m remaining")),
            .thread(.init(expert: ramesh, time: "10:45 AM", preview: "Please share your updated birth time so I can...", unread: 1)),
            .past(.init(expert: Expert.samples[2], kind: .call, minutes: 12, when: "Yesterday, 4:30 PM")),
            .past(.init(expert: keshavPast, kind: .chat, minutes: 18, when: "12 Oct, 09:15 AM")),
        ]
    }
}

/// C-10 — chats and calls. Content only; the tab bar lives in `CustomerTabShell`.
struct ChatsView: View {
    let activities: [ChatActivity]
    var onResume: (Expert) -> Void = { _ in }
    var onOpen: (Expert) -> Void = { _ in }
    var onCallAgain: (Expert) -> Void = { _ in }
    var onChatAgain: (Expert) -> Void = { _ in }

    @State private var tab: Filter = .all
    enum Filter { case all, active, past }

    private var visible: [ChatActivity] {
        activities.filter { item in
            switch (tab, item) {
            case (.all, _), (.active, .active), (.active, .thread), (.past, .past): true
            default: false
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                HStack {
                    Text("chats.title").textStyle(.sectionTitle).foregroundStyle(.brandIndigo)
                    Spacer(minLength: 0)
                    Icon(.search, size: 20).foregroundStyle(.brandIndigo).frame(width: 32, height: 32)
                }
                UnderlineTabs(tabs: [.init(value: .all, title: "chats.tab.all"),
                                     .init(value: .active, title: "chats.tab.active"),
                                     .init(value: .past, title: "chats.tab.past")],
                              selection: $tab)
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s4)
            .padding(.bottom, Spacing.s2)
            ScrollView {
                VStack(spacing: Spacing.s3) {
                    ForEach(visible) { row($0) }
                }
                .padding(Spacing.s3)
            }
            .scrollIndicators(.hidden)
        }
        .background(Color.brandBackground)
    }

    @ViewBuilder private func row(_ item: ChatActivity) -> some View {
        switch item {
        case .active(let a): ActiveSessionCard(session: a) { onResume(a.expert) }
        case .thread(let t): ThreadRow(thread: t).onTapGesture { onOpen(t.expert) }
        case .past(let p): PastRow(past: p) { p.kind == .call ? onCallAgain(p.expert) : onChatAgain(p.expert) }
        }
    }
}

private struct ActiveSessionCard: View {
    let session: ChatActivity.Active
    let onResume: () -> Void

    var body: some View {
        HStack {
            HStack(spacing: Spacing.s2_5) {
                ExpertAvatar(expert: session.expert, ringColor: .brandIndigo)
                VStack(alignment: .leading, spacing: 0) {
                    Text("chats.activeSession").textStyle(.nanoCaps).textCase(.uppercase).foregroundStyle(.brandSaffron)
                    Text(verbatim: session.expert.name).textStyle(.xsBold).foregroundStyle(.white)
                    Text(verbatim: "\(session.elapsed) · \(session.remaining)").textStyle(.nano).foregroundStyle(Color.borderAvatarLavender)
                }
            }
            Spacer(minLength: Spacing.s2)
            Button(action: onResume) {
                Text("chats.resume").textStyle(.xsBold).foregroundStyle(.brandIndigo)
                    .padding(.horizontal, Spacing.s3).padding(.vertical, Spacing.s1_5)
                    .background(Color.brandSaffron, in: RoundedRectangle(cornerRadius: Radius.xs))
            }
            .buttonStyle(.plain)
        }
        .padding(Spacing.s3_5)
        .background(Color.brandIndigo, in: RoundedRectangle(cornerRadius: Radius.md))
        .shadow(color: .black.opacity(0.1), radius: 3, y: 2)
    }
}

private struct ThreadRow: View {
    let thread: ChatActivity.Thread

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.s2_5) {
            ExpertAvatar(expert: thread.expert, showsStatus: false)
            VStack(alignment: .leading, spacing: Spacing.s0_5) {
                HStack(alignment: .firstTextBaseline) {
                    Text(verbatim: thread.expert.name).textStyle(.xsBold).foregroundStyle(.brandIndigo).lineLimit(1)
                    Spacer(minLength: Spacing.s2)
                    Text(verbatim: thread.time).textStyle(.nano).foregroundStyle(.textFaint)
                }
                Text(verbatim: thread.preview).textStyle(.micro).foregroundStyle(.textBody).lineLimit(1)
            }
            if thread.unread > 0 {
                Text(verbatim: "\(thread.unread)").textStyle(.fineBold).foregroundStyle(.white)
                    .frame(width: 16, height: 16).background(Color.brandIndigo, in: Circle())
                    .padding(.top, Spacing.s1)
            }
        }
        .surfaceCard()
    }
}

private struct PastRow: View {
    let past: ChatActivity.Past
    let action: () -> Void

    var body: some View {
        HStack {
            HStack(spacing: Spacing.s2_5) {
                ExpertAvatar(expert: past.expert, showsStatus: false)
                VStack(alignment: .leading, spacing: Spacing.s0_5) {
                    Text(verbatim: past.expert.name).textStyle(.xsBold).foregroundStyle(.brandIndigo)
                    RichText(key: past.kind == .call ? "chats.audioCall" : "chats.chatSession", args: [String(past.minutes)])
                        .textStyle(.micro).foregroundStyle(.textBody)
                    Text(verbatim: past.when).textStyle(.nano).foregroundStyle(.textFaint)
                }
            }
            Spacer(minLength: Spacing.s2)
            Button(action: action) {
                Text(past.kind == .call ? "chats.callAgain" : "chats.chatAgain")
                    .textStyle(.microBold).foregroundStyle(.brandIndigo)
                    .padding(.horizontal, Spacing.s2_5).padding(.vertical, Spacing.s1_5)
                    .overlay(RoundedRectangle(cornerRadius: Radius.xs).strokeBorder(Color.brandIndigo, lineWidth: BorderWidth.hairline))
            }
            .buttonStyle(.plain)
        }
        .surfaceCard()
    }
}

#Preview("Chats") {
    VStack(spacing: 0) {
        ChatsView(activities: ChatActivity.samples)
        BottomTabBar(selection: .constant(.chats))
    }
}
