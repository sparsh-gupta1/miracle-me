import SwiftUI

struct OTPVerificationView: View {
    @Bindable var model: OTPViewModel
    let phoneDisplay: String
    let onBack: () -> Void
    let onChangeNumber: () -> Void
    let onVerified: () -> Void

    var body: some View {
        ScreenContainer {
            VStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    TopBar(onBack: onBack) {
                        Text("otp.step").textStyle(.smSemibold).foregroundStyle(.textSecondary)
                    }
                    header.padding(.top, Spacing.s2)
                    OTPField(code: $model.code, isError: model.status == .incorrect)
                        .padding(.top, Spacing.s8)
                    statusArea
                }
                Spacer(minLength: 0)
                PrimaryButton(title: "otp.verify") {
                    Task { if await model.verify() { onVerified() } }
                }
                .disabled(!model.canVerify)
                .footerInset(Spacing.s4)
            }
        }
        .task(id: model.resendCount) { await model.runTimer() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("otp.title").textStyle(.pageTitle).foregroundStyle(.brandIndigo)
            HStack(spacing: Spacing.s2) {
                RichText(key: "otp.sentTo", args: [phoneDisplay]).textStyle(.bodyDefault).foregroundStyle(.textSecondary)
                Button(action: onChangeNumber) {
                    Text("otp.change").textStyle(.smSemibold).foregroundStyle(.brandSaffron)
                }
            }
        }
    }

    @ViewBuilder private var statusArea: some View {
        switch model.status {
        case .entering, .unreachable:
            if model.status == .unreachable {
                Callout(tone: .error, alignment: .center) {
                    Icon(.errorCircle, size: 20).foregroundStyle(.statusCritical)
                    Text(verbatim: "Can't reach the server. Check your connection and try again.")
                        .textStyle(.label).foregroundStyle(.statusCritical)
                }
                .padding(.top, Spacing.s4)
            }
            resendTimer.padding(.top, Spacing.s6)
            Callout(alignment: .center) {
                HStack(spacing: Spacing.s1_5) {
                    Icon(.phone, size: 16).foregroundStyle(.statusOnlineDot)
                    Text("otp.autoDetect")
                }
                .textStyle(.xsMedium)
                .foregroundStyle(.brandIndigo)
                Spacer(minLength: 0)
                Text("otp.waiting").textStyle(.xsMedium).foregroundStyle(.textSecondary)
            }
            .padding(.top, Spacing.s6)
        case .incorrect:
            Callout(tone: .error, alignment: .center) {
                Icon(.errorCircle, size: 20).foregroundStyle(.statusCritical)
                Text("otp.error").textStyle(.label).foregroundStyle(.statusCritical)
            }
            .padding(.top, Spacing.s4)
            resendTimer.padding(.top, Spacing.s6)
        case .expired:
            Callout(tone: .warning, alignment: .center) {
                Icon(.warning, size: 20).foregroundStyle(.statusBusyDot)
                Text("otp.expired").textStyle(.label).foregroundStyle(.statusBusyText)
            }
            .padding(.top, Spacing.s4)
            Button { model.resend() } label: {
                HStack(spacing: Spacing.s2) {
                    Icon(.refreshBold, size: 16)
                    Text("otp.resend")
                }
                .textStyle(.bodyBold)
                .foregroundStyle(.brandSaffron)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, Spacing.s6)
        }
    }

    @ViewBuilder private var resendTimer: some View {
        if model.canResend {
            Button { model.resend() } label: {
                HStack(spacing: Spacing.s2) {
                    Icon(.refreshBold, size: 16)
                    Text("otp.resend")
                }
                .textStyle(.bodyBold)
                .foregroundStyle(.brandSaffron)
            }
            .frame(maxWidth: .infinity)
        } else {
            RichText(key: "otp.resendIn", args: [model.timerText], emphasis: .smSemibold)
                .textStyle(.sm)
                .foregroundStyle(.textSecondary)
                .frame(maxWidth: .infinity)
        }
    }
}

#Preview("Entering") {
    OTPVerificationView(model: OTPViewModel(code: "58", secondsLeft: 28, verifier: { _ in .success }),
                        phoneDisplay: "+91 98765 43210", onBack: {}, onChangeNumber: {}, onVerified: {})
}
#Preview("Incorrect") {
    OTPVerificationView(model: OTPViewModel(code: "4092", status: .incorrect, secondsLeft: 14, verifier: { _ in .incorrect }),
                        phoneDisplay: "+91 98765 43210", onBack: {}, onChangeNumber: {}, onVerified: {})
}
#Preview("Expired · Hindi") {
    OTPVerificationView(model: OTPViewModel(status: .expired, secondsLeft: 0, verifier: { _ in .incorrect }),
                        phoneDisplay: "+91 98765 43210", onBack: {}, onChangeNumber: {}, onVerified: {})
        .environment(\.locale, AppLanguage.hindi.locale)
}
