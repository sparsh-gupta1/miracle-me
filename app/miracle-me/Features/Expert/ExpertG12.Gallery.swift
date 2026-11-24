import SwiftUI

/// Debug gallery entries for this group. Launch one with: `-galleryScreen <key>`.
enum ExpertGalleryG12 {
    @MainActor static let screens: [String: () -> AnyView] = [
        "e11": { AnyView(ExpertWithdrawalHistoryView(records: WithdrawalRecord.samples)) },
        "e12": { AnyView(ExpertBankAccountsView(primary: .sample, draft: .sample)) },
        "e13": { AnyView(ExpertPerformanceView(summary: .sample)) },
        "e14": { AnyView(ExpertPricesView(rows: ServicePriceRow.samples)) },
        "e15": { AnyView(ExpertScheduleView(autoOnline: true, days: [.mon, .tue, .wed, .thu, .fri], slots: ScheduleSlot.samples)) },
    ]
}
