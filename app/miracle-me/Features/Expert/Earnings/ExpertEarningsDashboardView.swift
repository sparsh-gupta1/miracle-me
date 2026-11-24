import SwiftUI

/// Figures for the E-08 dashboard. Amounts are display strings from the backend's settlement summary.
struct ExpertEarningsSummary {
    struct Metric: Identifiable {
        enum Tone {
            case strong, soft, muted, faint, positive, positiveStrong
            fileprivate var color: Color {
                switch self {
                case .strong: .g11Slate900
                case .soft: .g11Slate700
                case .muted: .g11Slate500
                case .faint: .g11Slate400
                case .positive: .g11Emerald600
                case .positiveStrong: .g11Emerald700
                }
            }
        }
        let id: String
        let title: String
        let value: String
        let caption: String
        var valueTone: Tone = .strong
        var captionTone: Tone = .faint
        var captionWeight: FontWeight = .regular
    }
    struct Bank {
        let code: String
        let title: String
        let detail: String
        let isVerified: Bool
    }

    let month: String
    let withdrawable: String
    let minimumWithdraw: String
    let metrics: [Metric]
    let bank: Bank
}

/// E-08 — earnings & payouts. Content only; the expert tab bar lives in the shell.
struct ExpertEarningsDashboardView: View {
    let summary: ExpertEarningsSummary
    var onPickMonth: () -> Void = {}
    var onWithdraw: () -> Void = {}
    var onChangeBank: () -> Void = {}
    var onOpenHistory: () -> Void = {}
    var onOpenPayouts: () -> Void = {}

    var body: some View {
        VStack(spacing: 0) {
            G11Bar(edge: .top) {
                HStack {
                    Text("e.g11.earn.title").textStyle(.g11Title).foregroundStyle(.brandIndigo)
                    Spacer(minLength: 0)
                    Button(action: onPickMonth) {
                        HStack(spacing: Spacing.s1) {
                            G11Icon("Calendar", size: 14)
                            Text(verbatim: summary.month)
                        }
                        .textStyle(.xsSemibold).foregroundStyle(.brandSaffron)
                    }
                }
                .padding(.horizontal, Spacing.s4).padding(.top, Spacing.s4).padding(.bottom, Spacing.s3)
            }
            ScrollView {
                VStack(spacing: Spacing.s3_5) {
                    hero
                    metricsGrid
                    bankCard
                    VStack(spacing: Spacing.s1_5) {
                        strip(icon: "Clipboard", tint: .brandSaffron, title: "e.g11.earn.history", action: onOpenHistory)
                        strip(icon: "CreditCard", tint: .brandIndigo, title: "e.g11.earn.payouts", action: onOpenPayouts)
                    }
                }
                .padding(Spacing.s3_5)
            }
            .scrollIndicators(.hidden)
        }
        .background(Color.brandBackground.ignoresSafeArea())
    }

    private var hero: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("e.g11.earn.withdrawable").textStyle(.xs).foregroundStyle(Color.g11Purple200)
                    Text(verbatim: summary.withdrawable).textStyle(.g11Hero).foregroundStyle(.white).padding(.top, Spacing.s1)
                    HStack(spacing: Spacing.s1) {
                        Icon(.check, size: 14)
                        Text("e.g11.earn.ready")
                    }
                    .textStyle(.micro).foregroundStyle(Color.g11Emerald300).padding(.top, Spacing.s1)
                }
                Spacer(minLength: Spacing.s2)
                G11Icon("WalletCard", size: 24).foregroundStyle(.brandSaffron)
                    .padding(Spacing.s2)
                    .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: Radius.md))
                    .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.white.opacity(0.1), lineWidth: BorderWidth.hairline))
            }
            HStack {
                Text(verbatim: "Min withdraw: \(summary.minimumWithdraw)").textStyle(.micro).foregroundStyle(Color.g11Purple200)
                Spacer(minLength: 0)
                Button(action: onWithdraw) {
                    Text("e.g11.earn.withdraw").textStyle(.xsBold).foregroundStyle(.brandIndigo)
                        .padding(.horizontal, Spacing.s4).padding(.vertical, Spacing.s1_5)
                        .background(Color.brandSaffron, in: RoundedRectangle(cornerRadius: Radius.md))
                        .shadow(color: .black.opacity(0.05), radius: 1, y: 1)
                }
                .buttonStyle(.plain)
            }
            .padding(.top, Spacing.s3)
            .overlay(alignment: .top) { Rectangle().fill(Color.white.opacity(0.15)).frame(height: BorderWidth.hairline) }
            .padding(.top, Spacing.s4)
        }
        .padding(Spacing.s4)
        .background(LinearGradient(colors: [.brandIndigo, .g11IndigoMid], startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: Radius.xl))
        .shadow(color: .black.opacity(0.1), radius: 3, y: 4)
        .shadow(color: .black.opacity(0.1), radius: 2, y: 2)
    }

    private var metricsGrid: some View {
        let columns = [GridItem(.flexible(), spacing: Spacing.s2_5), GridItem(.flexible(), spacing: Spacing.s2_5)]
        return LazyVGrid(columns: columns, spacing: Spacing.s2_5) {
            ForEach(summary.metrics) { metric in
                VStack(alignment: .leading, spacing: 0) {
                    Text(verbatim: metric.title).textStyle(.micro).foregroundStyle(Color.g11Slate500)
                    Text(verbatim: metric.value).textStyle(.g11Value).foregroundStyle(metric.valueTone.color)
                        .padding(.top, Spacing.s0_5)
                    Text(verbatim: metric.caption)
                        .textStyle(TextStyle.g11Nano.weight(metric.captionWeight))
                        .foregroundStyle(metric.captionTone.color)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Spacing.s3)
                .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.md))
                .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
            }
        }
    }

    private var bankCard: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            HStack {
                Text("e.g11.earn.bank").textStyle(.xsBold).foregroundStyle(Color.g11Slate800)
                Spacer(minLength: 0)
                if summary.bank.isVerified {
                    Text("e.g11.earn.verified").textStyle(.nanoBold).foregroundStyle(Color.g11Emerald700)
                        .padding(.horizontal, Spacing.s2).padding(.vertical, Spacing.s0_5)
                        .background(Color.g11Emerald50, in: RoundedRectangle(cornerRadius: 4))
                }
            }
            HStack(spacing: Spacing.s3) {
                Text(verbatim: summary.bank.code).textStyle(.xsBold).foregroundStyle(Color.g11Blue700)
                    .frame(width: 36, height: 36)
                    .background(Color.g11Blue50, in: RoundedRectangle(cornerRadius: Radius.xs))
                VStack(alignment: .leading, spacing: 0) {
                    Text(verbatim: summary.bank.title).textStyle(.xsSemibold).foregroundStyle(Color.g11Slate900)
                    Text(verbatim: summary.bank.detail).textStyle(.micro).foregroundStyle(Color.g11Slate500).lineLimit(1)
                }
                Spacer(minLength: 0)
                Button(action: onChangeBank) {
                    Text("e.g11.earn.change").textStyle(.xsSemibold).foregroundStyle(.brandSaffron)
                }
            }
        }
        .padding(Spacing.s3)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
    }

    private func strip(icon: String, tint: Color, title: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                HStack(spacing: Spacing.s2) {
                    G11Icon(icon, size: 16).foregroundStyle(tint)
                    Text(title)
                }
                Spacer(minLength: 0)
                G11Icon("ChevronRight", size: 16).foregroundStyle(Color.g11Slate400)
            }
            .textStyle(.xsSemibold).foregroundStyle(Color.g11Slate800)
            .padding(.horizontal, Spacing.s3).padding(.vertical, Spacing.s2_5)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.md))
            .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
        }
        .buttonStyle(.plain)
    }
}

extension ExpertEarningsSummary {
    static let sample = ExpertEarningsSummary(
        month: "Oct 2026", withdrawable: "₹4,820.00", minimumWithdraw: "₹500",
        metrics: [
            .init(id: "gross", title: "Gross Consultations", value: "₹6,025.00", caption: "+18% vs Sep",
                  captionTone: .positive, captionWeight: .semibold),
            .init(id: "fee", title: "Platform Share (20%)", value: "−₹1,205.00", caption: "Fixed deduction", valueTone: .soft),
            .init(id: "time", title: "Total Consultation Time", value: "4h 48m", caption: "24 Sessions", captionTone: .muted),
            .init(id: "free", title: "Free Minutes Reimbursed", value: "₹450.00", caption: "100% Platform Paid",
                  valueTone: .positive, captionTone: .positiveStrong, captionWeight: .medium),
        ],
        bank: .init(code: "HDFC", title: "HDFC Bank •••• 4092", detail: "IFSC: HDFC0001824 • Acharya Keshav", isVerified: true))
}

#Preview("E-08 Earnings") {
    VStack(spacing: 0) {
        ExpertEarningsDashboardView(summary: .sample)
        Color.surface.frame(height: 56)
    }
}
