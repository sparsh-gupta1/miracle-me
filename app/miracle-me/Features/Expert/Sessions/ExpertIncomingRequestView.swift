import SwiftUI

struct ExpertIncomingRequestSample {
    var customerName = "Rahul Sharma"
    var languages = "Hindi • English Speaker"
    var topic = "Career & Kundli Guidance"
    var birth = "14 Aug 1996, 06:45 AM • Jaipur, Rajasthan"
    var rate = "₹25.00 / min"
    var secondsToRespond = 22
}

/// E-02 incoming consultation request: scrim plus a bottom sheet with a response countdown.
struct ExpertIncomingRequestView: View {
    var sample = ExpertIncomingRequestSample()
    var onAccept: () -> Void = {}
    var onDecline: () -> Void = {}

    @State private var secondsLeft: Int
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    init(sample: ExpertIncomingRequestSample = .init(), onAccept: @escaping () -> Void = {}, onDecline: @escaping () -> Void = {}) {
        self.sample = sample
        self.onAccept = onAccept
        self.onDecline = onDecline
        _secondsLeft = State(initialValue: sample.secondsToRespond)
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.g10Scrim.ignoresSafeArea()
            sheet
        }
        .onReceive(tick) { _ in
            if secondsLeft > 0 { secondsLeft -= 1 } else { onDecline() }
        }
    }

    private var sheet: some View {
        VStack(spacing: 0) {
            Capsule().fill(Color.g10Grab).frame(width: 48, height: 4).padding(.bottom, Spacing.s4)
            header.padding(.bottom, Spacing.s4)
            countdown.padding(.horizontal, Spacing.s2).padding(.bottom, Spacing.s4)
            requestCard.padding(.bottom, Spacing.s4)
            VStack(spacing: Spacing.s2_5) {
                acceptButton
                declineButton
            }
            .padding(.top, Spacing.s1)
            Text("e.g10.e02.footnote").textStyle(.g10Text11).foregroundStyle(Color.g10OnSurfaceVariant)
                .multilineTextAlignment(.center).padding(.top, Spacing.s2)
        }
        .padding(Spacing.s5)
        .frame(maxWidth: .infinity)
        .background(
            UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28)
                .fill(Color.surface).ignoresSafeArea(edges: .bottom)
                .shadow(color: .black.opacity(0.25), radius: 25, y: -4)
        )
        .overlay(alignment: .top) {
            UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28)
                .strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline)
                .mask(Rectangle().frame(height: 2).frame(maxHeight: .infinity, alignment: .top))
        }
    }

    private var header: some View {
        VStack(spacing: 0) {
            ZStack {
                G10PingCircle(size: 64, color: .g10AmberTint)
                G10Icon("IconG10PhoneTalk", size: 28).foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(Color.brandSaffron, in: Circle())
                    .shadow(color: .black.opacity(0.1), radius: 3, y: 2)
            }
            .frame(width: 64, height: 64).padding(.bottom, Spacing.s2)
            Text("e.g10.e02.eyebrow").textStyle(.g10Badge).textCase(.uppercase).foregroundStyle(Color.g10Amber)
            Text(verbatim: sample.customerName).textStyle(.g10Title22Bold).foregroundStyle(Color.g10Ink)
            Text(verbatim: sample.languages).textStyle(.g10Caption).foregroundStyle(Color.g10OnSurfaceVariant)
        }
    }

    private var countdown: some View {
        HStack(spacing: Spacing.s2) {
            G10Icon("IconG10Timer", size: 18).foregroundStyle(Color.brandSaffron)
            Text("e.g10.e02.respond \(String(format: "%d:%02d", secondsLeft / 60, secondsLeft % 60))")
                .textStyle(.g10Text14Bold).foregroundStyle(Color.g10Amber)
                .monospacedDigit()
        }
        .padding(.horizontal, Spacing.s4).padding(.vertical, Spacing.s2)
        .frame(maxWidth: .infinity)
        .background(Color.g10AmberTint, in: Capsule())
        .overlay(Capsule().strokeBorder(Color.g10AmberBorder, lineWidth: BorderWidth.hairline))
    }

    private var requestCard: some View {
        VStack(spacing: Spacing.s3) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("e.g10.e02.topic.label").textStyle(.g10Text11Medium).foregroundStyle(Color.g10OnSurfaceVariant)
                    Text(verbatim: sample.topic).textStyle(.g10Text14Bold).foregroundStyle(Color.g10OnSurface)
                }
                Spacer(minLength: Spacing.s2)
                Text("e.g10.e02.first").textStyle(.g10Text11Semibold).foregroundStyle(Color.brandIndigo)
                    .padding(.horizontal, Spacing.s2).padding(.vertical, Spacing.s0_5)
                    .background(Color.brandIndigoTint, in: RoundedRectangle(cornerRadius: 4))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .leading, spacing: Spacing.s1) {
                HStack(spacing: Spacing.s1_5) {
                    G10Icon("IconG10Calendar", size: 14).foregroundStyle(Color.g10OnSurfaceVariant)
                    Text("e.g10.e02.birth.label").textStyle(.g10Text11Semibold).foregroundStyle(Color.g10OnSurface)
                }
                Text(verbatim: sample.birth).textStyle(.g10CaptionMedium).foregroundStyle(Color.g10OnSurface)
                    .padding(.leading, Spacing.s5)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .g10Card(radius: Radius.md, padding: Spacing.s2_5, shadow: false)
            HStack {
                Text("e.g10.e02.rate.label").textStyle(.g10Caption).foregroundStyle(Color.g10OnSurfaceVariant)
                Spacer(minLength: 0)
                Text(verbatim: sample.rate).textStyle(.g10Text14Bold).foregroundStyle(Color.g10Ink)
            }
            .padding(.top, Spacing.s1)
            .g10Rule(.top)
            RichText(key: "e.g10.e02.offer", emphasis: .g10Text11Bold, emphasisColor: .g10GreenDark)
                .textStyle(.g10Text11Tight).foregroundStyle(Color.g10GreenDark)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Spacing.s2)
                .background(Color.g10GreenPale, in: RoundedRectangle(cornerRadius: Radius.xs))
                .overlay(RoundedRectangle(cornerRadius: Radius.xs).strokeBorder(Color.g10GreenOutline, lineWidth: BorderWidth.hairline))
        }
        .g10Card(padding: Spacing.s3_5, fill: .brandBackground, shadow: false)
    }

    private var acceptButton: some View {
        Button(action: onAccept) {
            HStack(spacing: Spacing.s2) {
                G10Icon("IconPhoneCall", size: 20)
                Text("e.g10.e02.accept").textStyle(.g10SubheadBold)
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity).frame(height: 48)
            .background(Color.statusOnlineDot, in: RoundedRectangle(cornerRadius: Radius.lg))
            .shadow(color: .black.opacity(0.1), radius: 3, y: 2)
        }
        .buttonStyle(.plain)
    }

    private var declineButton: some View {
        Button(action: onDecline) {
            Text("e.g10.e02.decline").textStyle(.g10Text14Semibold).foregroundStyle(Color.statusCritical)
                .frame(maxWidth: .infinity).frame(height: 44)
                .overlay(RoundedRectangle(cornerRadius: Radius.lg).strokeBorder(Color.statusCritical, lineWidth: BorderWidth.hairline))
        }
        .buttonStyle(.plain)
    }
}

/// Soft ring that expands and fades (Tailwind `animate-ping` at 60% opacity).
struct G10PingCircle: View {
    let size: CGFloat
    let color: Color
    @State private var pinging = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Circle().fill(color).opacity(pinging ? 0 : 0.6).scaleEffect(pinging ? 2 : 1)
            .frame(width: size, height: size)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeOut(duration: 1).repeatForever(autoreverses: false)) { pinging = true }
            }
    }
}
