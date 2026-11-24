import SwiftUI

/// C-09 — waiting for the expert to accept, with a 30-second countdown.
struct WaitingForExpertView: View {
    let expert: Expert
    let service: ConsultService
    let onCancel: () -> Void
    let onTimeout: () -> Void

    @State private var remaining: Int
    @State private var pulsing = false

    init(expert: Expert, service: ConsultService, seconds: Int = 30, onCancel: @escaping () -> Void, onTimeout: @escaping () -> Void) {
        self.expert = expert
        self.service = service
        self.onCancel = onCancel
        self.onTimeout = onTimeout
        _remaining = State(initialValue: seconds)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer(minLength: 0)
                Circle().fill(Color.statusOnlineDot).frame(width: 8, height: 8)
            }
            .padding(Spacing.s4)
            Spacer(minLength: 0)
            VStack(spacing: 0) {
                avatar.padding(.bottom, Spacing.s6)
                RichText(key: "wait.title", args: [expert.name], emphasis: .baseBold)
                    .textStyle(.baseBold).foregroundStyle(.brandIndigo)
                    .multilineTextAlignment(.center)
                Text(service.waitingSubtitle).textStyle(.xs).foregroundStyle(.textBody)
                    .padding(.top, Spacing.s1)
                countdown.padding(.vertical, Spacing.s6)
                Text("wait.notCharged").textStyle(.xs).foregroundStyle(.textBody)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .surfaceCard(padding: Spacing.s3_5)
            }
            .padding(.horizontal, Spacing.s6)
            Spacer(minLength: 0)
            VStack(spacing: Spacing.s3) {
                Button(action: onCancel) {
                    Text("wait.cancel").textStyle(.xsBold).foregroundStyle(.statusCritical)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.md))
                        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.statusCritical, lineWidth: BorderWidth.hairline))
                }
                .buttonStyle(.plain)
                PrivacyNote(text: "session.private", style: .nano)
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.bottom, Spacing.s6)
        }
        .background(Color.brandBackground.ignoresSafeArea())
        .task { await runCountdown() }
        .onAppear { pulsing = true }
    }

    private var avatar: some View {
        ExpertAvatar(expert: expert, size: .hero, showsStatus: false)
            .shadow(color: .black.opacity(0.1), radius: 3, y: 4)
            .background {
                Circle().strokeBorder(Color.brandSaffron, lineWidth: BorderWidth.strong)
                    .padding(-Spacing.s3)
                    .scaleEffect(pulsing ? 1.4 : 1)
                    .opacity(pulsing ? 0 : 0.4)
                    .animation(.easeOut(duration: 1).repeatForever(autoreverses: false), value: pulsing)
            }
    }

    private var countdown: some View {
        VStack(spacing: Spacing.s0_5) {
            Text(verbatim: String(format: "%d:%02d", remaining / 60, remaining % 60))
                .textStyle(.countdown).foregroundStyle(.brandSaffron)
                .monospacedDigit()
            Text("wait.seconds").textStyle(.microMedium).foregroundStyle(.textBody)
        }
        .padding(.vertical, Spacing.s4)
        .padding(.horizontal, Spacing.s6)
        .frame(maxWidth: .infinity)
        .surfaceCard(radius: 16, padding: 0)
        .frame(maxWidth: 240)
        .accessibilityElement(children: .combine)
    }

    private func runCountdown() async {
        while remaining > 0 {
            try? await Task.sleep(for: .seconds(1))
            if Task.isCancelled { return }
            remaining -= 1
        }
        onTimeout()
    }
}

extension ConsultService {
    var waitingSubtitle: LocalizedStringKey {
        switch self {
        case .chat: "wait.sub.chat"
        case .audio: "wait.sub.audio"
        case .video: "wait.sub.video"
        }
    }
}

#Preview("Waiting") {
    WaitingForExpertView(expert: Expert.samples[0], service: .audio, seconds: 24, onCancel: {}, onTimeout: {})
}
