import SwiftUI

struct ExpertChatMessage: Identifiable {
    let id = UUID()
    let fromExpert: Bool
    let meta: String
    let text: String
}

struct ExpertActiveChatSample {
    var customerName = "Rahul Sharma"
    var customerFirstName = "Rahul"
    var elapsedSeconds = 6 * 60 + 14
    var earned = "₹120 earned"
    var birthSummary = "28y, M • 14 Aug 1996, 06:45 AM • Jaipur"
    var messages: [ExpertChatMessage] = [
        .init(fromExpert: false, meta: "Rahul • 06:10 PM",
              text: "Pranam Acharya ji, can you analyze my 10th house for career switch? Should I wait until next year?"),
        .init(fromExpert: true, meta: "You • 06:12 PM",
              text: "Namaste Rahul. Looking at your chart, Jupiter is currently transiting your 9th house and aspecting your 10th lord directly. November brings a favorable period."),
    ]
}

/// E-03 expert side of a live chat consultation.
struct ExpertActiveChatView: View {
    var sample = ExpertActiveChatSample()
    var onEnd: () -> Void = {}
    var onBack: () -> Void = {}

    @State private var elapsed: Int
    @State private var messages: [ExpertChatMessage]
    @State private var draft = ""
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    init(sample: ExpertActiveChatSample = .init(), onEnd: @escaping () -> Void = {}, onBack: @escaping () -> Void = {}) {
        self.sample = sample
        self.onEnd = onEnd
        self.onBack = onBack
        _elapsed = State(initialValue: sample.elapsedSeconds)
        _messages = State(initialValue: sample.messages)
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            birthStrip
            stream
            toolbar
            inputBar
        }
        .background(Color.brandBackground.ignoresSafeArea())
        .onReceive(tick) { _ in elapsed += 1 }
    }

    // MARK: Top bar

    private var topBar: some View {
        G10AppBar(horizontal: Spacing.s3, shadow: true) {
            HStack {
                HStack(spacing: Spacing.s2) {
                    Button(action: onBack) {
                        G10Icon("IconArrowLeft", size: 20).foregroundStyle(Color.g10OnSurface)
                            .frame(width: 32, height: 32)
                    }
                    .buttonStyle(.plain).accessibilityLabel("Minimize")
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: Spacing.s1_5) {
                            Text(verbatim: sample.customerName).textStyle(.g10Text14Bold).foregroundStyle(Color.g10Ink)
                            Circle().fill(Color.statusOnlineDot).frame(width: 8, height: 8)
                        }
                        HStack(spacing: Spacing.s2) {
                            Text(verbatim: G10Clock.format(elapsed)).textStyle(.g10Text11Bold).foregroundStyle(Color.brandSaffron).monospacedDigit()
                            Text(verbatim: "•").textStyle(.g10Text11).foregroundStyle(Color.g10OnSurfaceVariant)
                            Text(verbatim: sample.earned).textStyle(.g10Text11Semibold).foregroundStyle(Color.statusOnlineDot)
                        }
                    }
                }
                Spacer(minLength: 0)
                Button(action: onEnd) {
                    HStack(spacing: Spacing.s1) {
                        G10Icon("IconG10CallEnd", size: 16)
                        Text("e.g10.e03.end").textStyle(.g10CaptionBold)
                    }
                    .foregroundStyle(Color.statusCritical)
                    .padding(.horizontal, Spacing.s3).frame(height: 32)
                    .background(Color.g10RedTint, in: RoundedRectangle(cornerRadius: Radius.xs))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var birthStrip: some View {
        HStack {
            HStack(spacing: Spacing.s2) {
                G10Icon("IconG10AccountCircle", size: 18).foregroundStyle(Color.brandIndigo)
                Text(verbatim: sample.birthSummary).textStyle(.g10Text11Medium).foregroundStyle(Color.brandIndigo)
            }
            Spacer(minLength: 0)
            Button {} label: {
                G10Icon("IconG10Eye", size: 16).foregroundStyle(Color.brandIndigo)
            }
            .buttonStyle(.plain).accessibilityLabel("Expand birth info")
        }
        .padding(.horizontal, Spacing.s3_5).padding(.vertical, Spacing.s2)
        .frame(maxWidth: .infinity)
        .background(Color.brandIndigoTint)
        .g10Rule(.bottom, color: .g10LavenderLine)
    }

    // MARK: Stream

    private var stream: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: Spacing.s3) {
                    privacyPill.padding(.vertical, Spacing.s1)
                    ForEach(messages) { bubble($0).id($0.id) }
                }
                .padding(Spacing.s3_5)
            }
            .scrollIndicators(.hidden)
            .onChange(of: messages.count) { _, _ in
                if let last = messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
            }
        }
    }

    private var privacyPill: some View {
        HStack(spacing: Spacing.s1) {
            G10Icon("IconLock", size: 12).foregroundStyle(Color.g10Inactive)
            Text("e.g10.e03.privacy").textStyle(.g10Text11).foregroundStyle(Color.g10OnSurfaceVariant)
        }
        .padding(.horizontal, Spacing.s3).padding(.vertical, Spacing.s0_5)
        .background(Color.surface, in: Capsule())
        .overlay(Capsule().strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
        .elevationSm()
    }

    private func bubble(_ m: ExpertChatMessage) -> some View {
        let shape = UnevenRoundedRectangle(
            topLeadingRadius: m.fromExpert ? 16 : 0, bottomLeadingRadius: 16,
            bottomTrailingRadius: 16, topTrailingRadius: m.fromExpert ? 0 : 16)
        return VStack(alignment: m.fromExpert ? .trailing : .leading, spacing: Spacing.s1) {
            Text(verbatim: m.meta).textStyle(.g10Text10Medium).foregroundStyle(Color.g10OnSurfaceVariant)
                .padding(.horizontal, Spacing.s1)
            Text(verbatim: m.text).textStyle(.g10Body13)
                .foregroundStyle(m.fromExpert ? Color.g10OnSurface : Color.white)
                .multilineTextAlignment(.leading)
                .padding(Spacing.s3)
                .background(m.fromExpert ? Color.surface : Color.brandIndigo, in: shape)
                .overlay { if m.fromExpert { shape.strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline) } }
                .shadow(color: .black.opacity(0.1), radius: 2, y: 1)
            if m.fromExpert {
                HStack(spacing: Spacing.s1) {
                    Text("e.g10.e03.delivered").textStyle(.g10Text10)
                    G10Icon("IconG10DoneAll", size: 12).foregroundStyle(Color.statusOnlineDot)
                }
                .foregroundStyle(Color.g10OnSurfaceVariant).padding(.trailing, Spacing.s1)
            }
        }
        .frame(maxWidth: m.fromExpert ? 321 : 310, alignment: m.fromExpert ? .trailing : .leading)
        .frame(maxWidth: .infinity, alignment: m.fromExpert ? .trailing : .leading)
    }

    // MARK: Bottom

    private var toolbar: some View {
        ScrollView(.horizontal) {
            HStack(spacing: Spacing.s1_5) {
                actionChip("IconG10Analytics", "e.g10.e03.chip.kundli", tint: .brandSaffron)
                actionChip("IconG10EditNote", "e.g10.e03.chip.notes", tint: .brandIndigo)
                actionChip("IconG10Healing", "e.g10.e03.chip.remedy", tint: .statusOnlineDot)
            }
            .padding(.horizontal, Spacing.s3)
        }
        .scrollIndicators(.hidden)
        .padding(.vertical, Spacing.s1_5)
        .background(Color.brandBackground)
        .g10Rule(.top)
    }

    private func actionChip(_ icon: String, _ title: LocalizedStringKey, tint: Color) -> some View {
        Button {} label: {
            HStack(spacing: Spacing.s1) {
                G10Icon(icon, size: 14).foregroundStyle(tint)
                Text(title).textStyle(.g10Text11Bold).foregroundStyle(Color.brandIndigo)
            }
            .padding(.horizontal, Spacing.s2_5).frame(height: 28)
            .background(Color.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
            .elevationSm()
        }
        .buttonStyle(.plain)
    }

    private var inputBar: some View {
        HStack(spacing: Spacing.s2) {
            Button {} label: {
                G10Icon("IconG10Plus", size: 20).foregroundStyle(Color.g10OnSurfaceVariant)
                    .frame(width: 36, height: 36).background(Color.brandBackground, in: Circle())
            }
            .buttonStyle(.plain).accessibilityLabel("Attachment")
            HStack {
                TextField("", text: $draft,
                          prompt: Text("e.g10.e03.placeholder \(sample.customerFirstName)").foregroundStyle(Color.g10OnSurfaceVariant.opacity(0.6)))
                    .textStyle(.g10Body13Plain).foregroundStyle(Color.g10OnSurface)
                    .submitLabel(.send).onSubmit(send)
                Button {} label: {
                    G10Icon("IconMic", size: 18).foregroundStyle(Color.g10OnSurfaceVariant)
                }
                .buttonStyle(.plain).accessibilityLabel("Voice input")
            }
            .padding(.horizontal, Spacing.s3_5).padding(.vertical, Spacing.s1_5)
            .background(Color.brandBackground, in: Capsule())
            .overlay(Capsule().strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
            Button(action: send) {
                G10Icon("IconG10Send", size: 18).foregroundStyle(.white)
                    .frame(width: 36, height: 36).background(Color.brandSaffron, in: Circle())
                    .shadow(color: .black.opacity(0.1), radius: 3, y: 2)
            }
            .buttonStyle(.plain).accessibilityLabel("Send")
        }
        .padding(Spacing.s2_5)
        .background(Color.surface.ignoresSafeArea(edges: .bottom))
        .g10Rule(.top)
    }

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        messages.append(.init(fromExpert: true, meta: "You", text: text))
        draft = ""
    }
}

enum G10Clock {
    /// `mm:ss`, switching to `h:mm:ss` past an hour.
    static func format(_ seconds: Int) -> String {
        let h = seconds / 3600, m = (seconds % 3600) / 60, s = seconds % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%02d:%02d", m, s)
    }
}

extension TextStyle {
    static let g10Body13Plain = g10(13, 18)
}
