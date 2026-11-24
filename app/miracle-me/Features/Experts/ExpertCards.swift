import SwiftUI

/// Full-width expert row with Chat / Call actions.
struct ExpertCard: View {
    enum Style {
        case home    // languages + status on one line
        case search  // status on its own line
    }

    let expert: Expert
    var style: Style = .home
    var onChat: () -> Void = {}
    var onCall: () -> Void = {}
    var onNotify: () -> Void = {}

    private var isBusy: Bool { expert.status == .busy }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            HStack(alignment: .top, spacing: Spacing.s2) {
                HStack(alignment: .top, spacing: Spacing.s2_5) {
                    ExpertAvatar(expert: expert)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(verbatim: expert.name).textStyle(.xsBold).foregroundStyle(.brandIndigo)
                        RichText(key: "expert.summary", args: [expert.specialty, expert.ratingText, expert.reviewCountText])
                            .textStyle(.nano).foregroundStyle(.textMuted)
                        detailLine
                    }
                }
                Spacer(minLength: 0)
                Text(verbatim: expert.priceLabel).textStyle(.xsBold).foregroundStyle(.brandIndigo)
            }
            actions
        }
        .surfaceCard(shadow: false)
    }

    @ViewBuilder private var detailLine: some View {
        switch style {
        case .home:
            HStack(spacing: 0) {
                Text(verbatim: expert.languages.joined(separator: ", ") + " · ").textStyle(.nano).foregroundStyle(.textMuted)
                statusText
            }
        case .search:
            statusText
        }
    }

    private var statusText: some View {
        Text(expert.status.title).textStyle(.nanoSemibold).foregroundStyle(expert.status.tone.text)
    }

    @ViewBuilder private var actions: some View {
        if style == .search && isBusy {
            OutlineButton(title: "expert.notify", action: onNotify)
        } else {
            HStack(spacing: Spacing.s2) {
                OutlineButton(title: "expert.chat", action: onChat)
                SaffronButton(title: "expert.call", style: .xsBold, action: onCall)
            }
        }
    }
}

/// Compact "Online now" tile.
struct CompactExpertCard: View {
    let expert: Expert
    var onTalk: () -> Void = {}

    var body: some View {
        VStack(spacing: 0) {
            ExpertAvatar(expert: expert, size: .compact).padding(.bottom, Spacing.s1)
            Text(verbatim: expert.shortName)
                .textStyle(.microSemibold).foregroundStyle(.brandIndigo)
                .lineLimit(1).truncationMode(.tail)
            Text(verbatim: expert.priceLabel)
                .textStyle(.nano).foregroundStyle(.textMuted)
                .padding(.bottom, Spacing.s1_5)
            SaffronButton(title: "expert.talk", style: .nanoSemibold, radius: 6, vertical: Spacing.s1, action: onTalk)
        }
        .padding(Spacing.s2)
        .frame(width: 112)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
    }
}

/// Saffron action used inside cards.
struct SaffronButton: View {
    let title: LocalizedStringKey
    var style: TextStyle = .xsBold
    var radius: CGFloat = Radius.xs
    var vertical: CGFloat = Spacing.s1_5
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .textStyle(style)
                .foregroundStyle(.brandIndigo)
                .frame(maxWidth: .infinity)
                .padding(.vertical, vertical + BorderWidth.hairline)
                .background(Color.brandSaffron, in: RoundedRectangle(cornerRadius: radius))
        }
        .buttonStyle(.plain)
    }
}

/// Indigo-outlined action used inside cards.
struct OutlineButton: View {
    let title: LocalizedStringKey
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .textStyle(.xsSemibold)
                .foregroundStyle(.brandIndigo)
                .frame(maxWidth: .infinity)
                .padding(.vertical, Spacing.s1_5 + BorderWidth.hairline)
                .overlay(RoundedRectangle(cornerRadius: Radius.xs).strokeBorder(Color.brandIndigo, lineWidth: BorderWidth.hairline))
        }
        .buttonStyle(.plain)
    }
}
