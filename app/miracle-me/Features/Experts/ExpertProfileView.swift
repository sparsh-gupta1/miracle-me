import SwiftUI

/// C-06 — expert profile (online and busy variants).
struct ExpertProfileView: View {
    let profile: ExpertProfile
    @Binding var isFavourite: Bool
    let onBack: () -> Void
    /// Called with the service the customer wants to start.
    let onStart: (ConsultService) -> Void
    var onNotify: () -> Void = {}

    private var expert: Expert { profile.expert }
    private var isOnline: Bool { expert.status == .online }

    var body: some View {
        VStack(spacing: 0) {
            navBar
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s4) {
                    header
                    if !isOnline { busyBanner }
                    ratesCard
                    if !profile.about.isEmpty { aboutCard }
                    if !profile.specialities.isEmpty { specialitiesCard }
                    if let review = profile.review { reviewCard(review) }
                }
                .padding(Spacing.s4)
            }
            .scrollIndicators(.hidden)
            actionBar
        }
        .background(Color.brandBackground.ignoresSafeArea())
    }

    // MARK: Pieces

    private var navBar: some View {
        HStack {
            iconButton(.chevronLeftSm, size: 20, label: "Back", action: onBack)
            Spacer(minLength: 0)
            HStack(spacing: Spacing.s2) {
                iconButton(.share, size: 16, label: "Share") {}
                iconButton(isFavourite ? .heartFilled : .heart, size: 16, label: "Favourite", tint: .statusCritical) { isFavourite.toggle() }
                iconButton(.more, size: 16, label: "More") {}
            }
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.vertical, Spacing.s3)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.brandBorder).frame(height: BorderWidth.hairline) }
    }

    private func iconButton(_ icon: AppIcon, size: CGFloat, label: LocalizedStringKey, tint: Color = .brandIndigo,
                            action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Icon(icon, size: size).foregroundStyle(tint).frame(width: 32, height: 32)
        }
        .accessibilityLabel(label)
    }

    private var header: some View {
        HStack(alignment: .top, spacing: Spacing.s3) {
            ExpertAvatar(expert: expert, size: .large, ringColor: .white)
            VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: expert.name).textStyle(.profileName).foregroundStyle(.brandIndigo)
                Text(verbatim: profile.headline).textStyle(.xs).foregroundStyle(.textBody).padding(.top, Spacing.s0_5)
                HStack(spacing: Spacing.s1_5) {
                    HStack(spacing: Spacing.s1) {
                        Circle().fill(expert.status.tone.dot).frame(width: 6, height: 6)
                        Text(expert.status.title)
                    }
                    .textStyle(.xsSemibold).foregroundStyle(expert.status.tone.text)
                    Text(verbatim: "·").textStyle(.xs).foregroundStyle(.textFaint)
                    RichText(key: "ep.ratingReviews", args: [expert.ratingText, expert.reviewCountText])
                        .textStyle(.xsMedium).foregroundStyle(.textBody)
                }
                .padding(.top, Spacing.s1)
            }
        }
    }

    private var busyBanner: some View {
        Callout(tone: .busy, padding: Spacing.s3_5) {
            Icon(.clock, size: 20).foregroundStyle(.statusBusyDot).padding(.top, Spacing.s0_5)
            VStack(alignment: .leading, spacing: Spacing.s0_5) {
                RichText(key: "ep.busy.title", args: [expert.name]).textStyle(.xsBold).foregroundStyle(.noticeTitle)
                Text("ep.busy.body").textStyle(.microSnug).foregroundStyle(.statusBusyText)
            }
        }
    }

    private var ratesCard: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("ep.rates").textStyle(.microCaps).textCase(.uppercase).foregroundStyle(.textBody)
            VStack(spacing: Spacing.s1_5) {
                ForEach(profile.rates, id: \.service) { rate in
                    HStack {
                        Text(rate.service.rateTitle).textStyle(.xs).foregroundStyle(.textBody)
                        Spacer(minLength: 0)
                        Text(verbatim: rate.price).textStyle(.xsBold).foregroundStyle(.brandIndigo)
                    }
                    .padding(.vertical, Spacing.s1)
                    .overlay(alignment: .bottom) { Rectangle().fill(Color.dividerSoft).frame(height: BorderWidth.hairline) }
                }
                HStack {
                    Text("ep.freeMinutes").textStyle(.xsMedium)
                    Spacer(minLength: 0)
                    Text(verbatim: profile.freeMinutesText).textStyle(.microSemibold)
                        .padding(.horizontal, Spacing.s2).padding(.vertical, Spacing.s0_5)
                        .background(Color.statusOnlineBackground, in: RoundedRectangle(cornerRadius: 4))
                }
                .foregroundStyle(.statusOnlineText)
                .padding(.top, Spacing.s1_5)
            }
        }
        .surfaceCard()
    }

    private var aboutCard: some View {
        VStack(alignment: .leading, spacing: Spacing.s1_5) {
            Text("ep.about").textStyle(.xsSemiboldCaps).textCase(.uppercase).foregroundStyle(.brandIndigo)
            Text(verbatim: profile.about).textStyle(.captionRelaxed).foregroundStyle(.textBody)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .surfaceCard(padding: Spacing.s3_5)
    }

    private var specialitiesCard: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("ep.specialities").textStyle(.xsSemiboldCaps).textCase(.uppercase).foregroundStyle(.brandIndigo)
            FlowLayout(spacing: Spacing.s1_5) {
                ForEach(profile.specialities, id: \.self) { tag in
                    Text(verbatim: tag).textStyle(.microMedium).foregroundStyle(.brandIndigo)
                        .padding(.horizontal, Spacing.s2_5).padding(.vertical, Spacing.s1)
                        .background(Color.brandIndigoTint, in: RoundedRectangle(cornerRadius: Radius.xs))
                        .overlay(RoundedRectangle(cornerRadius: Radius.xs).strokeBorder(Color.borderTag, lineWidth: BorderWidth.hairline))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .surfaceCard(padding: Spacing.s3_5)
    }

    private func reviewCard(_ review: ExpertReview) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            HStack {
                Text("ep.reviews").textStyle(.xsSemiboldCaps).textCase(.uppercase).foregroundStyle(.brandIndigo)
                Spacer(minLength: 0)
                RichText(key: "ep.ratingLabel", args: [review.ratingText]).textStyle(.micro).foregroundStyle(.textBody)
            }
            VStack(alignment: .leading, spacing: Spacing.s1) {
                HStack {
                    Text(verbatim: review.author).textStyle(.xsBold).foregroundStyle(.brandIndigo)
                    Spacer(minLength: 0)
                    Text(verbatim: review.when).textStyle(.nano).foregroundStyle(.textFaint)
                }
                Text(verbatim: review.text).textStyle(.micro).foregroundStyle(.textBody)
            }
            .padding(.top, Spacing.s2)
            .overlay(alignment: .top) { Rectangle().fill(Color.dividerSoft).frame(height: BorderWidth.hairline) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .surfaceCard(padding: Spacing.s3_5)
    }

    @ViewBuilder private var actionBar: some View {
        Group {
            if isOnline {
                HStack(spacing: Spacing.s2) {
                    actionButton(filled: false, title: "ep.chatPrice", price: profile.price(for: .chat)) { onStart(.chat) }
                    actionButton(filled: true, title: "ep.callPrice", price: profile.price(for: .audio)) { onStart(.audio) }
                }
            } else {
                Button(action: onNotify) {
                    HStack(spacing: Spacing.s1_5) {
                        Icon(.bellRing, size: 16)
                        Text("expert.notify")
                    }
                    .textStyle(.xsBold).foregroundStyle(.brandIndigo)
                    .frame(maxWidth: .infinity).frame(height: 44)
                    .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandIndigo, lineWidth: BorderWidth.selected))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(Spacing.s3)
        .background(Color.surface.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Rectangle().fill(Color.brandBorder).frame(height: BorderWidth.hairline) }
    }

    private func actionButton(filled: Bool, title: String, price: String?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            RichText(key: title, args: [price ?? ""]).textStyle(.xsBold).foregroundStyle(.brandIndigo)
                .frame(maxWidth: .infinity).frame(height: 40)
                .background(filled ? Color.brandSaffron : .clear, in: RoundedRectangle(cornerRadius: Radius.md))
                .overlay {
                    if !filled { RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandIndigo, lineWidth: BorderWidth.selected) }
                }
        }
        .buttonStyle(.plain)
    }
}

/// Wrapping row layout for tags.
struct FlowLayout: Layout {
    var spacing: CGFloat = Spacing.s2

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        layout(in: proposal.width ?? .infinity, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(in: bounds.width, subviews: subviews)
        for (subview, origin) in zip(subviews, result.origins) {
            subview.place(at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y), proposal: .unspecified)
        }
    }

    private func layout(in width: CGFloat, subviews: Subviews) -> (size: CGSize, origins: [CGPoint]) {
        var origins: [CGPoint] = []
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            origins.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            maxX = max(maxX, x - spacing)
        }
        return (CGSize(width: maxX, height: y + rowHeight), origins)
    }
}

#Preview("Profile · online") {
    ExpertProfileView(profile: .keshav, isFavourite: .constant(false), onBack: {}, onStart: { _ in })
}
#Preview("Profile · busy") {
    ExpertProfileView(profile: .ramesh, isFavourite: .constant(true), onBack: {}, onStart: { _ in })
}
