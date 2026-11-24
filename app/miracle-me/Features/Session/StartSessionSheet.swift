import SwiftUI

/// Figures shown in the start-session sheet. Amounts are display strings because pricing is not final.
struct SessionQuote {
    var freeMinutesText = "[X] min free"
    var balanceText = "₹150"
    var talkTimeText = "[N] minutes"
    /// Non-nil when the balance is too low; the amount to recharge, e.g. "[X]".
    var rechargeAmount: String?
}

/// C-08 — bottom sheet to confirm a session (default) or top up first (low balance).
struct StartSessionSheet: View {
    let expert: Expert
    let rates: [ServiceRate]
    @State var service: ConsultService
    /// Quote per service: free minutes and talk time differ by service.
    let quotes: [ConsultService: SessionQuote]
    let onStart: (ConsultService, _ sharesBirthDetails: Bool) -> Void
    var onRecharge: (_ amount: Int) -> Void = { _ in }
    let onCancel: () -> Void

    @State private var sharesBirthDetails = true
    @State private var quickAmount = 200
    private let quickAmounts = [100, 200, 500]
    /// `nil` when the quote for the selected service failed to load: never show made-up figures.
    private var quote: SessionQuote? { quotes[service] }
    private var availableRates: [ServiceRate] { rates.filter { quotes[$0.service] != nil } }

    var body: some View {
        VStack(spacing: Spacing.s3_5) {
            Capsule().fill(Color.brandBorder).frame(width: 40, height: 4)
            expertRow
            if let quote {
                if quote.rechargeAmount == nil { readyContent(quote) } else { lowBalanceContent(quote) }
            }
        }
        .padding(Spacing.s4)
        .frame(maxWidth: .infinity)
        .background(Color.surface)
        .fittedSheet()
    }

    private var expertRow: some View {
        HStack {
            HStack(spacing: Spacing.s2_5) {
                ExpertAvatar(expert: expert, size: .compact, showsStatus: false)
                VStack(alignment: .leading, spacing: 0) {
                    Text(verbatim: expert.name).textStyle(.xsBold).foregroundStyle(.brandIndigo)
                    HStack(spacing: Spacing.s1) {
                        Circle().fill(expert.status.tone.dot).frame(width: 6, height: 6)
                        Text(expert.status.title)
                    }
                    .textStyle(.nano).foregroundStyle(expert.status.tone.text)
                }
            }
            Spacer(minLength: 0)
            if quote.map({ $0.rechargeAmount == nil }) == true {
                Text("session.start").textStyle(.microSemibold).foregroundStyle(.textBody)
            }
        }
        .padding(.bottom, Spacing.s2)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.dividerSoft).frame(height: BorderWidth.hairline) }
    }

    // MARK: Default

    private func readyContent(_ quote: SessionQuote) -> some View {
        VStack(spacing: Spacing.s3_5) {
            sectionLabel("session.choose") {
                HStack(spacing: Spacing.s2) {
                    ForEach(availableRates, id: \.service) { rate in serviceTile(rate) }
                }
            }
            summaryCard(quote)
            Toggle(isOn: $sharesBirthDetails) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("session.shareBirth").textStyle(.xsSemibold).foregroundStyle(.brandIndigo)
                    Text("session.shareBirthHint").textStyle(.nano).foregroundStyle(.textBody)
                }
            }
            .toggleStyle(.checkbox(spaceBetween: true))
            .padding(.vertical, Spacing.s1)
            VStack(spacing: Spacing.s2) {
                PrimaryButton(title: service.startKey, radius: Radius.md, height: 44, textStyle: .xsBold) {
                    onStart(service, sharesBirthDetails)
                }
                PrivacyNote(text: "session.private", style: .nano)
            }
            .padding(.top, Spacing.s1)
        }
    }

    private func serviceTile(_ rate: ServiceRate) -> some View {
        let selected = rate.service == service
        return Button { service = rate.service } label: {
            VStack(spacing: 0) {
                Text(rate.service.optionTitle).textStyle(selected ? .nanoBold : .nano)
                    .foregroundStyle(selected ? Color.brandIndigo : Color.textBody)
                Text(verbatim: rate.price).textStyle(.xsBold).foregroundStyle(.brandIndigo)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.s2)
            .background(selected ? Color.brandIndigoTint : Color.brandBackground, in: RoundedRectangle(cornerRadius: Radius.md))
            .overlay(RoundedRectangle(cornerRadius: Radius.md)
                .strokeBorder(selected ? Color.brandIndigo : Color.brandBorder,
                              lineWidth: selected ? BorderWidth.strong : BorderWidth.hairline))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func summaryCard(_ quote: SessionQuote) -> some View {
        VStack(spacing: Spacing.s1_5) {
            HStack {
                Text("ep.freeMinutes").textStyle(.xsMedium)
                Spacer(minLength: 0)
                Text(verbatim: quote.freeMinutesText).textStyle(.xsBold)
            }
            .foregroundStyle(.statusOnlineText)
            HStack {
                Text("session.balance").textStyle(.xs).foregroundStyle(.textBody)
                Spacer(minLength: 0)
                Text(verbatim: quote.balanceText).textStyle(.xsBold).foregroundStyle(.brandIndigo)
            }
            RichText(key: "session.canTalk", args: [quote.talkTimeText], emphasis: .microBold)
                .textStyle(.micro).foregroundStyle(.textBody)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, Spacing.s1)
                .overlay(alignment: .top) { Rectangle().fill(Color.brandBorder).frame(height: BorderWidth.hairline) }
        }
        .padding(Spacing.s3)
        .background(Color.brandBackground, in: RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
    }

    // MARK: Low balance

    @ViewBuilder private func lowBalanceContent(_ quote: SessionQuote) -> some View {
        let amount = quote.rechargeAmount ?? ""
        Callout(tone: .busy, alignment: .top) {
            Icon(.warning, size: 16).foregroundStyle(.statusBusyDot).padding(.top, Spacing.s0_5)
            VStack(alignment: .leading, spacing: Spacing.s0_5) {
                Text("session.low.title").textStyle(.xsBold).foregroundStyle(.noticeTitle)
                RichText(key: "session.low.body", args: [amount]).textStyle(.microSnug).foregroundStyle(.statusBusyText)
            }
        }
        sectionLabel("session.quick") {
            HStack(spacing: Spacing.s2) {
                ForEach(quickAmounts, id: \.self) { value in
                    let selected = value == quickAmount
                    Button { quickAmount = value } label: {
                        Text(verbatim: "₹\(value)").textStyle(.xsBold).foregroundStyle(.brandIndigo)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Spacing.s2_5)
                            .background(selected ? Color.brandIndigoTint : Color.brandBackground, in: RoundedRectangle(cornerRadius: Radius.md))
                            .overlay(RoundedRectangle(cornerRadius: Radius.md)
                                .strokeBorder(selected ? Color.brandIndigo : Color.brandBorder,
                                              lineWidth: selected ? BorderWidth.strong : BorderWidth.hairline))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
        }
        VStack(spacing: Spacing.s2) {
            Button { onRecharge(quickAmount) } label: {
                RichText(key: "session.recharge", args: [amount]).textStyle(.xsBold).foregroundStyle(.brandIndigo)
            }
            .buttonStyle(PrimaryButtonStyle(radius: Radius.md, height: 44))
            TextButton(title: "common.cancel", style: .xsSemibold, color: .textBody, action: onCancel)
                .frame(height: 32)
        }
        .padding(.top, Spacing.s1)
    }

    private func sectionLabel<Content: View>(_ title: LocalizedStringKey, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s1_5) {
            Text(title).textStyle(.microCaps).textCase(.uppercase).foregroundStyle(.textBody)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview("Session · default") {
    Color.brandBackground.sheet(isPresented: .constant(true)) {
        StartSessionSheet(expert: Expert.samples[0], rates: ExpertProfile.keshav.rates, service: .audio,
                          quotes: [.audio: SessionQuote()], onStart: { _, _ in }, onCancel: {})
    }
}
#Preview("Session · low balance") {
    Color.brandBackground.sheet(isPresented: .constant(true)) {
        StartSessionSheet(expert: Expert.samples[0], rates: ExpertProfile.keshav.rates, service: .audio,
                          quotes: [.audio: SessionQuote(rechargeAmount: "[X]")], onStart: { _, _ in }, onCancel: {})
    }
}
