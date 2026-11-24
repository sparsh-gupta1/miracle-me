import SwiftUI

struct ExpertActiveCallSample {
    var customerName = "Rahul Sharma"
    var initials = "RS"
    var topic = "Vedic Astrology • Career Focus"
    var languages = "Hindi • English"
    var elapsedSeconds = 8 * 60 + 45
    var rateAndEarned = "₹20/m • ₹160 earned"
    var lagna = "Scorpio (8)"
    var moonSign = "Taurus (2)"
    var dasha = "Jup - Sat"
    var notes = "\"Customer inquired about job shift in Nov 2026. Recommended yellow sapphire consideration. Follow-up chart analysis suggested in 3 months.\""
}

/// E-04 expert side of a live audio call.
struct ExpertActiveCallView: View {
    var sample = ExpertActiveCallSample()
    var onEnd: () -> Void = {}

    @State private var elapsed: Int
    @State private var muted = false
    @State private var speaker = false
    @State private var notes: String
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    init(sample: ExpertActiveCallSample = .init(), onEnd: @escaping () -> Void = {}) {
        self.sample = sample
        self.onEnd = onEnd
        _elapsed = State(initialValue: sample.elapsedSeconds)
        _notes = State(initialValue: sample.notes)
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                VStack(spacing: Spacing.s3) {
                    callerCard
                    horoscopeCard
                    notesCard
                }
                .padding(.horizontal, Spacing.s4).padding(.vertical, Spacing.s3)
            }
            .scrollIndicators(.hidden)
            controls
        }
        .background(Color.brandBackground.ignoresSafeArea())
        .onReceive(tick) { _ in elapsed += 1 }
    }

    private var topBar: some View {
        G10AppBar {
            HStack {
                VStack(alignment: .leading, spacing: 0) {
                    Text("e.g10.e04.eyebrow").textStyle(.g10Badge).textCase(.uppercase).foregroundStyle(Color.g10Amber)
                    Text(verbatim: sample.customerName).textStyle(.g10SubheadBold).foregroundStyle(Color.g10Ink)
                }
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 0) {
                    HStack(spacing: Spacing.s1) {
                        G10BlinkDot(size: 8, color: .brandSaffron)
                        Text(verbatim: G10Clock.format(elapsed)).monospacedDigit()
                    }
                    .textStyle(.g10Title16Bold).foregroundStyle(Color.brandSaffron)
                    Text(verbatim: sample.rateAndEarned).textStyle(.g10Text11Bold).foregroundStyle(Color.statusOnlineDot)
                }
            }
        }
    }

    private var callerCard: some View {
        HStack(spacing: Spacing.s3_5) {
            G10Avatar(initials: sample.initials, size: 56, style: .g10Title20Bold)
                .overlay(alignment: .bottomTrailing) {
                    G10Icon("IconMic", size: 12).foregroundStyle(.white)
                        .frame(width: 20, height: 20).background(Color.statusOnlineDot, in: Circle())
                        .overlay(Circle().strokeBorder(Color.white, lineWidth: 2))
                        .offset(x: 4, y: 4)
                }
            VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: sample.customerName).textStyle(.g10SubheadBold).foregroundStyle(Color.g10OnSurface).lineLimit(1)
                Text(verbatim: sample.topic).textStyle(.g10Caption).foregroundStyle(Color.g10OnSurfaceVariant).lineLimit(1)
                HStack(spacing: Spacing.s2) {
                    Text("e.g10.e04.audiohd").textStyle(.g10Text10Semibold).foregroundStyle(Color.g10Amber)
                        .padding(.horizontal, Spacing.s2).padding(.vertical, Spacing.s0_5)
                        .background(Color.g10AmberTint, in: Capsule())
                    Text(verbatim: sample.languages).textStyle(.g10Text10).foregroundStyle(Color.g10OnSurfaceVariant)
                }
                .padding(.top, Spacing.s1)
            }
            Spacer(minLength: 0)
        }
        .g10Card(padding: Spacing.s3_5)
    }

    private var horoscopeCard: some View {
        VStack(spacing: Spacing.s2_5) {
            HStack {
                HStack(spacing: Spacing.s1_5) {
                    G10Icon("IconG10Sparkles", size: 18)
                    Text("e.g10.e04.horoscope").textStyle(.g10Body13Bold)
                }
                .foregroundStyle(Color.brandIndigo)
                Spacer(minLength: 0)
                Button {} label: {
                    Text("e.g10.e04.fullchart").textStyle(.g10Text11Bold).foregroundStyle(Color.g10Amber)
                }
                .buttonStyle(.plain)
            }
            .padding(.bottom, Spacing.s2)
            .g10Rule(.bottom, color: .g10Divider)
            HStack(spacing: Spacing.s2) {
                chartCell("e.g10.e04.lagna", sample.lagna)
                chartCell("e.g10.e04.moon", sample.moonSign)
                chartCell("e.g10.e04.dasha", sample.dasha)
            }
            RichText(key: "e.g10.e04.aspect", emphasis: .g10Text11Bold, emphasisColor: .g10TipText)
                .textStyle(.g10Text11).foregroundStyle(Color.g10TipText)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Spacing.s2)
                .background(Color.g10TipBackground, in: RoundedRectangle(cornerRadius: Radius.xs))
                .overlay(RoundedRectangle(cornerRadius: Radius.xs).strokeBorder(Color.g10TipBorder, lineWidth: BorderWidth.hairline))
        }
        .g10Card(padding: Spacing.s3_5)
    }

    private func chartCell(_ label: LocalizedStringKey, _ value: String) -> some View {
        VStack(spacing: 0) {
            Text(label).textStyle(.g10Text10).foregroundStyle(Color.g10OnSurfaceVariant)
            Text(verbatim: value).textStyle(.g10Text12Bold).foregroundStyle(Color.g10Ink)
        }
        .frame(maxWidth: .infinity)
        .padding(Spacing.s2)
        .background(Color.brandBackground, in: RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
    }

    private var notesCard: some View {
        VStack(spacing: Spacing.s1_5) {
            HStack {
                HStack(spacing: Spacing.s1) {
                    G10Icon("IconLock", size: 16).foregroundStyle(Color.g10OnSurfaceVariant)
                    Text("e.g10.e04.notes").textStyle(.g10Body13Bold).foregroundStyle(Color.g10OnSurface)
                }
                Spacer(minLength: 0)
                Text("e.g10.e04.autosaved").textStyle(.g10Text10).foregroundStyle(Color.g10OnSurfaceVariant)
            }
            TextField("", text: $notes, axis: .vertical)
                .textStyle(.g10CaptionRelaxed).italic().foregroundStyle(Color.g10OnSurface)
                .padding(Spacing.s2_5)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.brandBackground, in: RoundedRectangle(cornerRadius: Radius.md))
                .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
        }
        .g10Card(padding: Spacing.s3_5)
    }

    private var controls: some View {
        HStack {
            roundControl("IconMic", label: "Mute mic", active: muted) { muted.toggle() }
            Spacer(minLength: 0)
            roundControl("IconG10Volume", label: "Speaker", active: speaker) { speaker.toggle() }
            Spacer(minLength: 0)
            roundControl("IconG10Grid", label: "View Chart", fill: .brandIndigoTint, border: .g10LavenderBorder,
                         tint: .brandIndigo, active: false) {}
            Spacer(minLength: 0)
            Button(action: onEnd) {
                G10Icon("IconG10CallEnd", size: 26).foregroundStyle(.white)
                    .frame(width: 56, height: 56).background(Color.statusCritical, in: Circle())
                    .shadow(color: .black.opacity(0.15), radius: 8, y: 4)
            }
            .buttonStyle(.plain).accessibilityLabel("End call")
        }
        .padding(Spacing.s4)
        .background(Color.surface.ignoresSafeArea(edges: .bottom))
        .g10Rule(.top)
        .shadow(color: .black.opacity(0.08), radius: 8, y: -2)
    }

    private func roundControl(_ icon: String, label: String, fill: Color = .brandBackground, border: Color = .brandBorder,
                              tint: Color = .g10Ink, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            G10Icon(icon, size: 24).foregroundStyle(active ? Color.white : tint)
                .frame(width: 52, height: 52)
                .background(active ? Color.g10Ink : fill, in: Circle())
                .overlay(Circle().strokeBorder(border, lineWidth: BorderWidth.hairline))
                .elevationSm()
        }
        .buttonStyle(.plain).accessibilityLabel(label)
    }
}

/// Dot that fades in and out (Tailwind `animate-pulse`).
struct G10BlinkDot: View {
    let size: CGFloat
    let color: Color
    @State private var dim = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Circle().fill(color).frame(width: size, height: size).opacity(dim ? 0.5 : 1)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) { dim = true }
            }
    }
}
