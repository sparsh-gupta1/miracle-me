import SwiftUI

struct SignInView: View {
    @Binding var mode: SignInMode
    @Binding var phone: String
    @Binding var role: ExpertRole
    var isSending = false
    /// Why the last attempt to send a code failed (network, unknown expert number…).
    var errorMessage: String?
    let onBack: () -> Void
    let onSendCode: () -> Void

    private var canSend: Bool { phone.count == PhoneNumberField.length }

    var body: some View {
        ScreenContainer {
            VStack(spacing: 0) {
                VStack(spacing: 0) {
                    if mode == .customer { customerContent } else { expertContent }
                }
                Spacer(minLength: 0)
                footer.footerInset(Spacing.s4)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: mode)
    }

    // MARK: Customer

    private var customerContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            TopBar(onBack: onBack) { SunMarkBadge(diameter: 28) }
            VStack(alignment: .leading, spacing: Spacing.s1_5) {
                Text("signin.title").textStyle(.pageTitle).foregroundStyle(.brandIndigo)
                Text("signin.subtitle").textStyle(.subtitle).foregroundStyle(.textSecondary)
            }
            .padding(.top, Spacing.s2)
            VStack(alignment: .leading, spacing: Spacing.s2) {
                FieldLabel(text: "field.mobile")
                PhoneNumberField(digits: $phone, showsValidity: true)
            }
            .padding(.top, Spacing.s6)
            Callout {
                Text("🔒").textStyle(.bodyDefault)
                Text("signin.privacy").textStyle(.captionRelaxed).foregroundStyle(.brandIndigo)
            }
            .padding(.top, Spacing.s4)
        }
    }

    // MARK: Expert

    private var expertContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            TopBar(bottomPadding: Spacing.s3, onBack: onBack) {
                Text("signin.expertChip")
                    .textStyle(.smSemibold)
                    .foregroundStyle(.brandIndigo)
                    .padding(.horizontal, Spacing.s3)
                    .padding(.vertical, Spacing.s1)
                    .background(Color.brandIndigoTint, in: Capsule())
                    .overlay(Capsule().strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
            }
            SegmentedControl(
                options: [.init(value: .customer, title: "signin.mode.customer"),
                          .init(value: .expert, title: "signin.mode.expert")],
                selection: $mode)
                .padding(.top, Spacing.s2)
            VStack(alignment: .leading, spacing: Spacing.s1_5) {
                (Text("expert.roleLabel") + Text(verbatim: " *").foregroundStyle(Color.statusCritical))
                    .textStyle(.labelStrong)
                    .foregroundStyle(.brandIndigo)
                HStack(spacing: Spacing.s2_5) {
                    ForEach(ExpertRole.allCases) { item in
                        RoleOptionCard(role: item, isSelected: item == role) { role = item }
                    }
                }
            }
            .padding(.top, Spacing.s4)
            VStack(alignment: .leading, spacing: Spacing.s1_5) {
                FieldLabel(text: "expert.mobileLabel")
                PhoneNumberField(digits: $phone)
            }
            .padding(.top, Spacing.s5)
            Callout(tone: .notice) {
                Icon(.infoRound, size: 16).foregroundStyle(Color.statusBusyText).padding(.top, Spacing.s0_5)
                Text("expert.notice").textStyle(.micro).foregroundStyle(.brandIndigo)
            }
            .padding(.top, Spacing.s4)
        }
    }

    // MARK: Footer

    private var footer: some View {
        VStack(spacing: 0) {
            RichText(key: mode == .customer ? "signin.legal" : "expert.legal", emphasis: .microMedium)
                .textStyle(.micro)
                .foregroundStyle(.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Spacing.s2)
                .padding(.bottom, Spacing.s3)
            if let errorMessage {
                Callout(tone: .error, alignment: .center) {
                    Icon(.errorCircle, size: 16).foregroundStyle(.statusCritical)
                    Text(verbatim: errorMessage).textStyle(.label).foregroundStyle(.statusCritical)
                }
                .padding(.bottom, Spacing.s3)
            }
            PrimaryButton(title: "signin.sendCode", action: onSendCode)
                .disabled(!canSend || isSending)
            if mode == .customer {
                Button { mode = .expert } label: {
                    Text("signin.expertLink").textStyle(.smMedium).foregroundStyle(.brandIndigo)
                }
                .padding(.top, Spacing.s4)
            }
        }
    }
}

private struct RoleOptionCard: View {
    let role: ExpertRole
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Radius.md)
        Button(action: action) {
            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(verbatim: role.title)
                        .textStyle(.smBold, script: .latin)
                        .foregroundStyle(isSelected ? Color.brandIndigo : Color.textPrimary)
                    Text(verbatim: role.hindiTitle)
                        .textStyle(.micro, script: .devanagari)
                        .foregroundStyle(.textSecondary)
                }
                Spacer(minLength: 0)
                radio
            }
            .padding(Spacing.s3)
            .background(isSelected ? Color.brandSaffronTint : Color.surface, in: shape)
            .overlay(shape.strokeBorder(isSelected ? Color.brandSaffron : Color.brandBorder,
                                        lineWidth: isSelected ? BorderWidth.strong : BorderWidth.hairline))
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var radio: some View {
        Circle()
            .strokeBorder(isSelected ? Color.brandIndigo : Color.textSecondary, lineWidth: BorderWidth.strong)
            .frame(width: 16, height: 16)
            .overlay { if isSelected { Circle().fill(Color.brandSaffron).frame(width: 8, height: 8) } }
    }
}

#Preview("Customer EN") {
    SignInView(mode: .constant(.customer), phone: .constant("9876543210"), role: .constant(.astrologer), onBack: {}, onSendCode: {})
}
#Preview("Customer HI") {
    SignInView(mode: .constant(.customer), phone: .constant("9876543210"), role: .constant(.astrologer), onBack: {}, onSendCode: {})
        .environment(\.locale, AppLanguage.hindi.locale)
}
#Preview("Expert") {
    SignInView(mode: .constant(.expert), phone: .constant("9412055432"), role: .constant(.astrologer), onBack: {}, onSendCode: {})
}
