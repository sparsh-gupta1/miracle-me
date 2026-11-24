import SwiftUI

struct PayoutBankAccount: Hashable {
    /// Short bank mark shown in the 40-pt tile, e.g. "HDFC".
    let bankMark: String
    let bankName: String
    /// "Savings A/c •••• 4092"
    let accountLabel: String
    let beneficiary: String
    let ifsc: String
    let nameMatchText: String
}

/// Draft of the "link a secondary account" form.
struct BankLinkDraft: Equatable {
    var accountNumber = ""
    var confirmAccountNumber = ""
    var ifsc = ""
    /// Bank and branch resolved from the IFSC, e.g. "ICICI Bank Limited • Connaught Place, New Delhi".
    var ifscLookup: String?
    var acceptsPennyDrop = true
}

/// E-12 — bank accounts & KYC.
struct ExpertBankAccountsView: View {
    let primary: PayoutBankAccount
    var kycActive = true
    @State var draft: BankLinkDraft
    var onBack: () -> Void = {}
    var onViewProof: () -> Void = {}
    var onVerify: (BankLinkDraft) -> Void = { _ in }

    var body: some View {
        G12Screen {
            G12Header(title: "e.g12.bank.title", onBack: onBack) {
                if kycActive {
                    Text("e.g12.bank.kyc").textStyle(.g12MetaBold).foregroundStyle(.g12Green)
                        .padding(.horizontal, Spacing.s2).padding(.vertical, 3)
                        .background(Color.g12GreenTint, in: RoundedRectangle(cornerRadius: 4))
                }
            }
        } content: {
            primaryCard
            linkCard
        }
    }

    private var primaryCard: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            HStack(spacing: Spacing.s3) {
                Text(verbatim: primary.bankMark).textStyle(.g12BankMark)
                    .foregroundStyle(.brandIndigo)
                    .frame(width: 40, height: 40)
                    .background(Color.g12CardBorder, in: RoundedRectangle(cornerRadius: Radius.xs))
                VStack(alignment: .leading, spacing: 0) {
                    Text(verbatim: primary.bankName).textStyle(.compactButton).foregroundStyle(.brandIndigo)
                    Text(verbatim: primary.accountLabel).textStyle(.g12Meta).foregroundStyle(.g12Muted)
                }
            }
            VStack(spacing: Spacing.s1) {
                G12KeyValueRow(label: "e.g12.bank.beneficiary", value: primary.beneficiary,
                               valueStyle: .g12MetaSemibold, labelStyle: .g12MetaRegular)
                G12KeyValueRow(label: "e.g12.bank.ifsc", value: primary.ifsc,
                               valueStyle: .g12Mono11, labelStyle: .g12MetaRegular)
                G12KeyValueRow(label: "e.g12.bank.pennyMatch", value: primary.nameMatchText,
                               valueStyle: .g12MetaBold, valueColor: .g12Green, labelStyle: .g12MetaRegular)
            }
            .padding(Spacing.s2_5)
            .frame(maxWidth: .infinity)
            .background(Color.brandBackground, in: RoundedRectangle(cornerRadius: Radius.xs))
            Button(action: onViewProof) {
                Text("e.g12.bank.viewProof").textStyle(.g12MetaSemibold).foregroundStyle(.brandIndigo)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.s2)
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color.g12Input, lineWidth: BorderWidth.hairline))
            }
            .buttonStyle(.plain)
        }
        .g12Card(border: .brandIndigo, borderWidth: BorderWidth.selected)
        .overlay(alignment: .topTrailing) {
            Text("e.g12.bank.primary").textStyle(.g12NanoBold).foregroundStyle(.white)
                .padding(.horizontal, Spacing.s2).padding(.vertical, 2)
                .background(Color.brandIndigo, in: Capsule())
                .padding(Spacing.s3)
        }
    }

    private var linkCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("e.g12.bank.linkTitle").textStyle(.g12Sec13).foregroundStyle(.brandIndigo).padding(.bottom, Spacing.s1)
            Text("e.g12.bank.linkHint").textStyle(.g12Para11).foregroundStyle(.g12Muted).padding(.bottom, Spacing.s3_5)
            VStack(alignment: .leading, spacing: Spacing.s2_5) {
                field("e.g12.bank.accountNumber") {
                    TextField("e.g12.bank.accountPlaceholder", text: $draft.accountNumber).keyboardType(.numberPad)
                }
                field("e.g12.bank.reenter") {
                    SecureField("", text: $draft.confirmAccountNumber).keyboardType(.numberPad)
                }
                VStack(alignment: .leading, spacing: 3) {
                    field("e.g12.bank.ifscLabel") {
                        TextField("", text: $draft.ifsc).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    }
                    if let lookup = draft.ifscLookup {
                        Text(verbatim: lookup).textStyle(.g12Label105).foregroundStyle(.g12Green)
                    }
                }
                Toggle(isOn: $draft.acceptsPennyDrop) {
                    Text("e.g12.bank.pennyDrop").textStyle(.g12Nano).foregroundStyle(.g12Body)
                }
                .toggleStyle(.checkbox(alignment: .top))
                .padding(.top, Spacing.s1)
                G12PrimaryButton(title: "e.g12.bank.verify", height: 42, textStyle: .g12Btn125) { onVerify(draft) }
                    .padding(.top, Spacing.s1_5)
            }
        }
        .g12Card(background: .brandBackground)
    }

    private func field<Input: View>(_ label: LocalizedStringKey, @ViewBuilder input: () -> Input) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s1) {
            Text(label).textStyle(.g12Label105Caps).textCase(.uppercase).foregroundStyle(.g12Body)
            input()
                .textStyle(.g12Input12).foregroundStyle(.brandIndigo)
                .padding(.horizontal, Spacing.s2_5)
                .frame(height: 38)
                .background(Color.surface, in: RoundedRectangle(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color.g12Input, lineWidth: BorderWidth.hairline))
        }
    }
}

extension PayoutBankAccount {
    static let sample = PayoutBankAccount(
        bankMark: "HDFC", bankName: "HDFC Bank Limited", accountLabel: "Savings A/c •••• 4092",
        beneficiary: "KESHAV SHARMA", ifsc: "HDFC0001824", nameMatchText: "100% Name Verified")
}

extension BankLinkDraft {
    static let sample = BankLinkDraft(accountNumber: "50100492817291", confirmAccountNumber: "••••••••••••••",
                                      ifsc: "ICIC0000104",
                                      ifscLookup: "ICICI Bank Limited • Connaught Place, New Delhi")
}

#Preview("E-12 Bank accounts") { ExpertBankAccountsView(primary: .sample, draft: .sample) }
