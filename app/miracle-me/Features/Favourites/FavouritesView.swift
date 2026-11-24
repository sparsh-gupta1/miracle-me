import SwiftUI

struct FavouriteExpert: Identifiable, Hashable {
    let expert: Expert
    let role: String
    /// Display price, e.g. "₹[A]/min".
    let price: String
    var id: String { expert.id }
}

extension FavouriteExpert {
    static var samples: [FavouriteExpert] {
        var priya = Expert.samples[2]
        priya.status = .offline
        var ramesh = Expert.samples[1]
        ramesh.status = .busy
        return [
            .init(expert: Expert.samples[0], role: "Vedic Astrologer", price: "₹[A]/min"),
            .init(expert: ramesh, role: "Tarot Specialist", price: "₹[B]/min"),
            .init(expert: priya, role: "Empathetic Listener", price: "₹[B]/min"),
        ]
    }
}

/// C-07 — saved experts. Content only; the tab bar lives in `CustomerTabShell`.
struct FavouritesView: View {
    let favourites: [FavouriteExpert]
    var onRemove: (FavouriteExpert) -> Void = { _ in }
    var onChat: (Expert) -> Void = { _ in }
    var onCall: (Expert) -> Void = { _ in }
    var onNotify: (Expert) -> Void = { _ in }

    @State private var tab: Filter = .all
    enum Filter { case all, astrologers, listeners }

    private var visible: [FavouriteExpert] {
        switch tab {
        case .all: favourites
        case .astrologers: favourites.filter { $0.expert.kind == .astrologer }
        case .listeners: favourites.filter { $0.expert.kind == .listener }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                HStack {
                    VStack(alignment: .leading, spacing: Spacing.s0_5) {
                        Text("fav.title").textStyle(.sectionTitle).foregroundStyle(.brandIndigo)
                        RichText(key: "fav.count", args: [String(favourites.count)]).textStyle(.xs).foregroundStyle(.textBody)
                    }
                    Spacer(minLength: 0)
                    Icon(.search, size: 20).foregroundStyle(.brandIndigo).frame(width: 32, height: 32)
                }
                UnderlineTabs(tabs: [.init(value: .all, title: "home.tab.all"),
                                     .init(value: .astrologers, title: "home.tab.astrologers"),
                                     .init(value: .listeners, title: "home.tab.listeners")],
                              selection: $tab)
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s4)
            .padding(.bottom, Spacing.s2)
            ScrollView {
                VStack(spacing: Spacing.s3) {
                    ForEach(visible) { item in
                        FavouriteCard(item: item, onRemove: { onRemove(item) },
                                      onChat: { onChat(item.expert) }, onCall: { onCall(item.expert) },
                                      onNotify: { onNotify(item.expert) })
                    }
                }
                .padding(Spacing.s3)
            }
            .scrollIndicators(.hidden)
        }
        .background(Color.brandBackground)
    }
}

private struct FavouriteCard: View {
    let item: FavouriteExpert
    let onRemove: () -> Void
    let onChat: () -> Void
    let onCall: () -> Void
    let onNotify: () -> Void

    private var expert: Expert { item.expert }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            HStack(alignment: .top) {
                HStack(alignment: .top, spacing: Spacing.s2_5) {
                    ExpertAvatar(expert: expert, size: .medium)
                        .opacity(expert.status == .offline ? 0.8 : 1)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(verbatim: expert.name).textStyle(.xsBold).foregroundStyle(.brandIndigo)
                        Text(verbatim: item.role).textStyle(.micro).foregroundStyle(.textBody)
                        HStack(spacing: Spacing.s1_5) {
                            Text(statusTitle).foregroundStyle(expert.status.tone.text).fontWeight(.medium)
                            Text(verbatim: "·").foregroundStyle(.textFaint)
                            Text(verbatim: item.price).foregroundStyle(.textBody)
                        }
                        .textStyle(.nano)
                        .padding(.top, Spacing.s0_5)
                    }
                }
                Spacer(minLength: 0)
                Button(action: onRemove) {
                    Icon(.heartFilled, size: 16).foregroundStyle(.statusCritical).padding(Spacing.s1)
                }
                .accessibilityLabel("Remove from favourites")
            }
            actions
                .padding(.top, Spacing.s2)
                .overlay(alignment: .top) { Rectangle().fill(Color.dividerSoft).frame(height: BorderWidth.hairline) }
        }
        .surfaceCard()
    }

    private var statusTitle: LocalizedStringKey { expert.status == .offline ? "status.offlineNow" : expert.status.title }

    @ViewBuilder private var actions: some View {
        switch expert.status {
        case .online:
            HStack(spacing: Spacing.s2) {
                CardButton(title: "expert.chat", filled: false, action: onChat)
                CardButton(title: "expert.call", filled: true, action: onCall)
            }
        case .busy:
            CardButton(title: "expert.notify", filled: false, action: onNotify)
        case .offline:
            CardButton(title: "fav.notifyMe", filled: false, action: onNotify)
        }
    }
}

/// Compact 11-pt card action (outlined or saffron).
private struct CardButton: View {
    let title: LocalizedStringKey
    let filled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).textStyle(.microBold).foregroundStyle(.brandIndigo)
                .frame(maxWidth: .infinity)
                .padding(.vertical, Spacing.s1_5 + BorderWidth.hairline)
                .background(filled ? Color.brandSaffron : Color.surface, in: RoundedRectangle(cornerRadius: Radius.xs))
                .overlay {
                    if !filled { RoundedRectangle(cornerRadius: Radius.xs).strokeBorder(Color.brandIndigo, lineWidth: BorderWidth.hairline) }
                }
        }
        .buttonStyle(.plain)
    }
}

#Preview("Favourites") {
    VStack(spacing: 0) {
        FavouritesView(favourites: FavouriteExpert.samples)
        BottomTabBar(selection: .constant(.home))
    }
}
