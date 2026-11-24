import SwiftUI

/// Bank account choice on the withdrawal form.
struct ExpertPayoutBank: Hashable {
    let code: String
    let title: String
    let detail: String
}

/// E-10 — withdrawal request form with live fee / TDS preview.
struct ExpertWithdrawView: View {
    let available: Double
    let dailyLimit: Double
    let minimum: Double
    let bank: ExpertPayoutBank
    /// Section 194O TDS rate (1%).
    var tdsRate: Double = 0.01
    @Binding var amountText: String
    var onBack: () -> Void = {}
    var onHistory: () -> Void = {}
    var onAddBank: () -> Void = {}
    var onConfirm: (Double) -> Void = { _ in }

    private let quick: [Double] = [1000, 2000, 4000]

    private var amount: Double { Double(amountText.filter { $0.isNumber || $0 == "." }) ?? 0 }
    private var tds: Double { (amount * tdsRate * 100).rounded() / 100 }
    private var net: Double { amount - tds }
    private var isValid: Bool { amount >= minimum && amount <= min(available, dailyLimit) }

    var body: some View {
        VStack(spacing: 0) {
            G11Bar(edge: .top) {
                HStack {
                    HStack(spacing: Spacing.s2) {
                        Button(action: onBack) {
                            G11Icon("ChevronLeft", size: 20).foregroundStyle(Color.g11Slate600).padding(Spacing.s1)
                        }
                        .accessibilityLabel("Back")
                        Text("e.g11.withdraw.title").textStyle(.g11BarTitle).foregroundStyle(.brandIndigo)
                    }
                    Spacer(minLength: 0)
                    Button(action: onHistory) {
                        Text("e.g11.withdraw.history").textStyle(.xsMedium).foregroundStyle(Color.g11Slate500)
                    }
                }
                .padding(.horizontal, Spacing.s3).padding(.top, Spacing.s4).padding(.bottom, Spacing.s3)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s4) {
                    balanceCard
                    amountField
                    bankSelection
                    breakdown
                    reassurance
                }
                .padding(Spacing.s3_5)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            G11Bar(edge: .bottom) {
                Button { onConfirm(amount) } label: {
                    Text(verbatim: "Confirm & Request Payout (\(G11Format.rupees(net)))")
                        .textStyle(.compactButton).foregroundStyle(.brandIndigo)
                        .frame(maxWidth: .infinity).padding(.vertical, Spacing.s3)
                        .background(Color.brandSaffron, in: RoundedRectangle(cornerRadius: Radius.md))
                        .shadow(color: .black.opacity(0.1), radius: 3, y: 2)
                        .opacity(isValid ? 1 : 0.5)
                }
                .buttonStyle(.plain).disabled(!isValid)
                .padding(Spacing.s3)
            }
            .overlay(alignment: .top) { Rectangle().fill(Color.brandBorder).frame(height: BorderWidth.hairline) }
        }
        .background(Color.brandBackground.ignoresSafeArea())
    }

    private var balanceCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("e.g11.withdraw.available").textStyle(.xsMedium).foregroundStyle(.brandIndigo)
            Text(verbatim: G11Format.rupees(available)).textStyle(.g11Balance.weight(.bold)).foregroundStyle(.brandIndigo)
                .padding(.top, Spacing.s0_5)
            Text(verbatim: "Daily withdrawal limit: \(G11Format.rupees(dailyLimit).dropLast(3)) • Min amount: \(G11Format.rupees(minimum).dropLast(3))")
                .textStyle(.micro).foregroundStyle(Color.g11Slate600).padding(.top, Spacing.s1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.s3_5)
        .background(Color.g11IndigoLight, in: RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandIndigo.opacity(0.15), lineWidth: BorderWidth.hairline))
    }

    private var amountField: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("e.g11.withdraw.enter").textStyle(.xsBold).foregroundStyle(Color.g11Slate800)
            HStack(spacing: Spacing.s2) {
                Text(verbatim: "₹").textStyle(.baseBold).foregroundStyle(Color.g11Slate500)
                TextField("", text: $amountText).keyboardType(.decimalPad)
                    .textStyle(.baseBold).foregroundStyle(Color.g11Slate900)
                Button { amountText = format(available) } label: {
                    Text("e.g11.withdraw.max").textStyle(.microBold).foregroundStyle(.brandIndigo)
                        .padding(.horizontal, Spacing.s2).padding(.vertical, Spacing.s1)
                        .background(Color.brandBackground, in: RoundedRectangle(cornerRadius: Radius.xs))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Spacing.s3).padding(.vertical, Spacing.s2_5)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.md))
            .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
            HStack(spacing: Spacing.s2) {
                ForEach(quick, id: \.self) { value in chip(G11Format.rupees(value).dropLast(3).description, on: amount == value) { amountText = format(value) } }
                chip("All", on: amount == available) { amountText = format(available) }
            }
        }
    }

    private func chip(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(verbatim: title).textStyle(on ? .xsBold : .xsSemibold)
                .foregroundStyle(on ? Color.brandSaffron : Color.g11Slate700)
                .frame(maxWidth: .infinity).padding(.vertical, Spacing.s1_5)
                .background(on ? Color.g11Amber50 : Color.surface, in: RoundedRectangle(cornerRadius: Radius.xs))
                .overlay(RoundedRectangle(cornerRadius: Radius.xs)
                    .strokeBorder(on ? Color.brandSaffron : Color.brandBorder, lineWidth: on ? BorderWidth.strong : BorderWidth.hairline))
        }
        .buttonStyle(.plain)
    }

    private var bankSelection: some View {
        VStack(alignment: .leading, spacing: Spacing.s1_5) {
            Text("e.g11.withdraw.transferTo").textStyle(.xsBold).foregroundStyle(Color.g11Slate800)
            HStack(spacing: Spacing.s3) {
                Text(verbatim: bank.code).textStyle(.xsBold).foregroundStyle(Color.g11Blue700)
                    .frame(width: 40, height: 40).background(Color.g11Blue50, in: RoundedRectangle(cornerRadius: Radius.xs))
                VStack(alignment: .leading, spacing: 0) {
                    Text(verbatim: bank.title).textStyle(.xsBold).foregroundStyle(Color.g11Slate900)
                    Text(verbatim: bank.detail).textStyle(.micro).foregroundStyle(Color.g11Slate500).lineLimit(1)
                }
                Spacer(minLength: 0)
                Circle().strokeBorder(Color.brandSaffron, lineWidth: 4).background(Circle().fill(Color.surface)).frame(width: 20, height: 20)
            }
            .padding(Spacing.s3)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.md))
            .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandSaffron, lineWidth: BorderWidth.strong))
            Button(action: onAddBank) {
                Text("e.g11.withdraw.addBank").textStyle(.xsBold).foregroundStyle(.brandSaffron)
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }

    private var breakdown: some View {
        VStack(spacing: Spacing.s2) {
            line("e.g11.withdraw.requested", G11Format.rupees(amount), .g11Slate900)
            line("e.g11.withdraw.fee", "₹0.00 (Free)", .g11Emerald700)
            line("e.g11.withdraw.tds", "−" + G11Format.rupees(tds), .g11Slate700)
            HStack {
                Text("e.g11.withdraw.net").textStyle(.xsBold).foregroundStyle(Color.g11Slate900)
                Spacer(minLength: 0)
                Text(verbatim: G11Format.rupees(net)).textStyle(.g11SmBold.weight(.bold)).foregroundStyle(.brandSaffron)
            }
            .padding(.top, Spacing.s2)
            .overlay(alignment: .top) { Rectangle().fill(Color.g11Slate100).frame(height: BorderWidth.hairline) }
        }
        .padding(Spacing.s3)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
    }

    private func line(_ title: LocalizedStringKey, _ value: String, _ color: Color) -> some View {
        HStack {
            Text(title).textStyle(.xs).foregroundStyle(Color.g11Slate600)
            Spacer(minLength: 0)
            Text(verbatim: value).textStyle(.xsBold).foregroundStyle(color)
        }
    }

    private var reassurance: some View {
        HStack(alignment: .top, spacing: Spacing.s2) {
            G11Icon("ShieldCheck", size: 16).foregroundStyle(Color.g11Emerald600).padding(.top, Spacing.s0_5)
            Text("e.g11.withdraw.note").textStyle(.micro).foregroundStyle(Color.g11Slate600)
            Spacer(minLength: 0)
        }
        .padding(Spacing.s2_5)
        .background(Color.g11Slate50, in: RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.g11Slate200, lineWidth: BorderWidth.hairline))
    }

    private func format(_ value: Double) -> String {
        let f = NumberFormatter(); f.locale = Locale(identifier: "en_IN"); f.numberStyle = .decimal; f.maximumFractionDigits = 2
        return f.string(from: value as NSNumber) ?? ""
    }
}

extension ExpertPayoutBank {
    static let sample = ExpertPayoutBank(code: "HDFC", title: "HDFC Bank •••• 4092", detail: "IFSC: HDFC0001824 • Savings A/c")
}

#Preview("E-10 Withdraw") {
    ExpertWithdrawView(available: 4820, dailyLimit: 25000, minimum: 500, bank: .sample, amountText: .constant("4,000"))
}
