import SwiftUI

struct WithdrawalRecord: Identifiable, Hashable {
    enum Status { case pending, paid, failed }

    let id: String
    let status: Status
    /// "13 Nov 2026, 10:05 AM" (pending rows are prefixed "Requested").
    let dateText: String
    let amountText: String
    let bankText: String
    var tdsText: String?
    var utr: String?
    var note: String?
    var failureReason: String?
}

/// E-11 — withdrawal history.
struct ExpertWithdrawalHistoryView: View {
    enum Filter: CaseIterable { case all, paid, pending, failed }

    let records: [WithdrawalRecord]
    var onBack: () -> Void = {}
    var onExport: () -> Void = {}
    var onUpdateBank: (WithdrawalRecord) -> Void = { _ in }
    var onContactSupport: () -> Void = {}

    @State private var filter: Filter = .all

    private var visible: [WithdrawalRecord] {
        records.filter { record in
            switch (filter, record.status) {
            case (.all, _), (.paid, .paid), (.pending, .pending), (.failed, .failed): true
            default: false
            }
        }
    }

    var body: some View {
        G12Screen {
            G12Header(title: "e.g12.withdrawals.title", onBack: onBack) {
                G12IconButton(icon: "IconG12DownloadTray", size: 18, label: "Export", action: onExport)
            }
        } content: {
            FlowLayout(spacing: Spacing.s2) {
                ForEach(Filter.allCases, id: \.self) { item in
                    G12Pill(title: item.title, isActive: item == filter) { filter = item }
                }
            }
            ForEach(visible) { record in
                WithdrawalCard(record: record, onUpdateBank: { onUpdateBank(record) })
            }
            HStack {
                Spacer(minLength: 0)
                G12SupportLine(prefix: "e.g12.withdrawals.help", link: "e.g12.contactSupport", action: onContactSupport)
                Spacer(minLength: 0)
            }
            .padding(.top, Spacing.s1).padding(.bottom, Spacing.s2)
        }
    }
}

private extension ExpertWithdrawalHistoryView.Filter {
    var title: LocalizedStringKey {
        switch self {
        case .all: "e.g12.filter.all"
        case .paid: "e.g12.filter.paid"
        case .pending: "e.g12.filter.pending"
        case .failed: "e.g12.filter.failed"
        }
    }
}

private struct WithdrawalCard: View {
    let record: WithdrawalRecord
    let onUpdateBank: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: Spacing.s0_5) {
                    dateText.textStyle(.g12Meta).foregroundStyle(.g12Muted)
                    Text(verbatim: record.amountText).textStyle(.g12Amount).foregroundStyle(.brandIndigo)
                }
                Spacer(minLength: Spacing.s2)
                badge
            }
            .padding(.bottom, Spacing.s2)
            detail
        }
        .g12Card(accent: accent)
    }

    @ViewBuilder private var dateText: some View {
        if record.status == .pending {
            Text("e.g12.withdrawals.requested \(record.dateText)")
        } else {
            Text(verbatim: record.dateText)
        }
    }

    private var accent: Color? {
        switch record.status {
        case .pending: .g12Pending
        case .failed: .g12Red
        case .paid: nil
        }
    }

    private var badge: some View {
        let (title, foreground, background): (LocalizedStringKey, Color, Color) = switch record.status {
        case .pending: ("e.g12.filter.pending", .statusBusyText, .statusBusyBackground)
        case .paid: ("e.g12.status.paid", .g12Green, .g12GreenTint)
        case .failed: ("e.g12.status.failed", .g12Red, .g12RedTint)
        }
        return Text(title).textStyle(.g12Badge).textCase(.uppercase).foregroundStyle(foreground)
            .padding(.horizontal, Spacing.s2).padding(.vertical, 3)
            .background(background, in: RoundedRectangle(cornerRadius: 6))
    }

    @ViewBuilder private var detail: some View {
        switch record.status {
        case .pending:
            VStack(alignment: .leading, spacing: Spacing.s2) {
                if let note = record.note { Text(verbatim: note).textStyle(.g12Para115).foregroundStyle(.g12Body) }
                G12KeyValueRow(label: "e.g12.withdrawals.to", value: record.bankText)
            }
        case .paid:
            G12InsetPanel {
                G12KeyValueRow(label: "e.g12.withdrawals.to", value: record.bankText)
                if let tds = record.tdsText { G12KeyValueRow(label: "e.g12.withdrawals.tds", value: tds) }
                if let utr = record.utr {
                    G12KeyValueRow(label: "e.g12.withdrawals.utr", value: utr, valueStyle: .g12Mono10, valueColor: .g12Muted)
                }
            }
        case .failed:
            VStack(alignment: .leading, spacing: Spacing.s2) {
                if let reason = record.failureReason {
                    Text(verbatim: reason).textStyle(.g12Para11).foregroundStyle(.g12Red)
                }
                G12SecondaryButton(title: "e.g12.withdrawals.updateBank", height: 40, action: onUpdateBank)
            }
        }
    }
}

extension WithdrawalRecord {
    static let samples: [WithdrawalRecord] = [
        .init(id: "w4", status: .pending, dateText: "13 Nov 2026, 10:05 AM", amountText: "₹3,000.00",
              bankText: "HDFC Bank •••• 4092",
              note: "Our team processes payouts after approval. Payout time: [TO CONFIRM]."),
        .init(id: "w3", status: .paid, dateText: "14 Oct 2026, 04:30 PM", amountText: "₹4,000.00",
              bankText: "HDFC Bank •••• 4092", tdsText: "[TO CONFIRM]", utr: "HDFCR520261014902"),
        .init(id: "w2", status: .paid, dateText: "07 Oct 2026, 02:15 PM", amountText: "₹5,000.00",
              bankText: "HDFC Bank •••• 4092", utr: "HDFCR520261007215"),
        .init(id: "w1", status: .failed, dateText: "29 Sep 2026, 11:20 AM", amountText: "₹2,000.00",
              bankText: "HDFC Bank •••• 4092",
              failureReason: "Account name mismatch. The amount is back in your earnings balance."),
    ]
}

#Preview("E-11 Withdrawal history") { ExpertWithdrawalHistoryView(records: WithdrawalRecord.samples) }
