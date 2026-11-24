import SwiftUI

/// Sample data for the expert home (UI only).
struct ExpertHomeSample {
    var initials = "AK"
    var name = "Acharya Keshav"
    var earnings = "₹1,420"
    var change = "+24% vs y'day"
    var sessions = "4"
    var rating = "4.9 ★"
    var onlineTime = "2h 15m"
    var chatRate = "₹20/min"
    var audioRate = "₹25/min"
    var videoRate = "₹40/min"
    var recentName = "Rahul Sharma"
    var recentInitials = "RS"
    var recentMeta = "14 mins duration · 25 mins ago"
    var recentAmount = "+₹280"
    var discoveryCategory = "Kundli & Career"
}

/// E-01 expert home. Offline and online share one screen; the master toggle switches between them.
struct ExpertHomeView: View {
    @State private var isOnline: Bool
    var sample = ExpertHomeSample()

    init(isOnline: Bool = false, sample: ExpertHomeSample = .init()) {
        _isOnline = State(initialValue: isOnline)
        self.sample = sample
    }

    var body: some View {
        VStack(spacing: 0) {
            appBar
            ScrollView {
                VStack(spacing: Spacing.s3_5) {
                    if isOnline { onlineContent } else { offlineContent }
                }
                .padding(Spacing.s4)
            }
            .scrollIndicators(.hidden)
        }
        .background(Color.brandBackground.ignoresSafeArea())
        .animation(.easeInOut(duration: 0.2), value: isOnline)
    }

    // MARK: App bar

    private var appBar: some View {
        G10AppBar {
            HStack(spacing: Spacing.s2_5) {
                G10Avatar(initials: sample.initials)
                    .overlay(alignment: .bottomTrailing) {
                        if isOnline {
                            Circle().fill(Color.statusOnlineDot).frame(width: 10, height: 10)
                                .overlay(Circle().stroke(Color.white, lineWidth: 2).padding(-1))
                        }
                    }
                VStack(alignment: .leading, spacing: 0) {
                    Text("e.g10.home.greeting").textStyle(.g10CaptionMedium).foregroundStyle(Color.g10OnSurfaceVariant)
                    Text(verbatim: sample.name).textStyle(.g10SubheadTight).foregroundStyle(Color.g10Ink)
                }
                Spacer(minLength: 0)
                if isOnline {
                    onlinePill.padding(.trailing, Spacing.s1)
                }
                G10BellButton(showsDot: !isOnline)
            }
        }
    }

    private var onlinePill: some View {
        HStack(spacing: Spacing.s1) {
            G10PingDot(size: 8, showsRing: true)
            Text("e.g10.home.online.pill").textStyle(.g10Text11Caps).textCase(.uppercase)
        }
        .foregroundStyle(Color.statusOnlineDot)
        .padding(.horizontal, Spacing.s2).padding(.vertical, Spacing.s1)
        .background(Color.emerald50, in: Capsule())
        .overlay(Capsule().strokeBorder(Color.g10EmeraldBorder, lineWidth: BorderWidth.hairline))
    }

    // MARK: Offline

    private var offlineContent: some View {
        Group {
            availabilityCard
            offlineSummary
            queueCard
            tipCard
        }
    }

    private var availabilityCard: some View {
        VStack(spacing: 0) {
            HStack {
                HStack(spacing: Spacing.s2) {
                    Circle().fill(Color.statusOfflineDot).frame(width: 10, height: 10)
                    Text("e.g10.home.offline.title").textStyle(.g10Title18Bold).foregroundStyle(Color.g10OnSurface)
                }
                Spacer(minLength: 0)
                G10Toggle(isOn: $isOnline)
            }
            .padding(.bottom, Spacing.s2)
            Text("e.g10.home.offline.body").textStyle(.g10Body13)
                .foregroundStyle(Color.g10OnSurfaceVariant)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, Spacing.s3)
            HStack(spacing: Spacing.s2) {
                pausedChannel(icon: "IconChat", title: "e.g10.home.channel.chat")
                pausedChannel(icon: "IconPhoneCall", title: "e.g10.home.channel.audio")
                pausedChannel(icon: "IconG10Video", title: "e.g10.home.channel.video")
            }
            .padding(.top, Spacing.s3)
            .g10Rule(.top, color: .g10Divider)
        }
        .g10Card()
    }

    private func pausedChannel(icon: String, title: LocalizedStringKey) -> some View {
        VStack(spacing: 0) {
            G10Icon(icon, size: 18).foregroundStyle(Color.statusOfflineDot).padding(.bottom, Spacing.s1)
            Text(title).textStyle(.g10Text11Semibold).foregroundStyle(Color.g10OnSurface)
            Text("e.g10.home.channel.paused").textStyle(.g10Text10).foregroundStyle(Color.g10OnSurfaceVariant)
        }
        .frame(maxWidth: .infinity)
        .padding(Spacing.s2)
        .background(Color.brandBackground, in: RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
        .opacity(0.6)
    }

    private var offlineSummary: some View {
        VStack(spacing: 0) {
            HStack {
                Text("e.g10.home.summary.title").textStyle(.g10Subhead).foregroundStyle(Color.g10OnSurface)
                Spacer(minLength: 0)
                Text("e.g10.home.summary.badge").textStyle(.g10CaptionSemibold).foregroundStyle(Color.g10Amber)
                    .padding(.horizontal, Spacing.s2).padding(.vertical, Spacing.s0_5)
                    .background(Color.g10AmberTint, in: Capsule())
            }
            .padding(.bottom, Spacing.s3)
            .g10Rule(.bottom, color: .g10Divider)
            G10StatRow {
                stat("₹0", "e.g10.home.summary.total")
            } b: {
                stat("0", "e.g10.home.summary.sessions")
            } c: {
                stat("0m", "e.g10.home.summary.online")
            }
            .padding(.top, Spacing.s3)
        }
        .g10Card()
    }

    private func stat(_ value: String, _ label: LocalizedStringKey) -> some View {
        VStack(spacing: 0) {
            Text(verbatim: value).textStyle(.g10Title18Bold).foregroundStyle(Color.g10Ink)
            Text(label).textStyle(.g10Text11).foregroundStyle(Color.g10OnSurfaceVariant)
        }
    }

    private var queueCard: some View {
        VStack(spacing: 0) {
            G10Icon("IconG10HourglassOff", size: 24).foregroundStyle(Color.brandIndigo)
                .frame(width: 48, height: 48)
                .background(Color.brandIndigoTint, in: Circle())
                .padding(.bottom, Spacing.s3)
            Text("e.g10.home.queue.title").textStyle(.g10Subhead).foregroundStyle(Color.g10Ink)
                .padding(.bottom, Spacing.s1)
            Text("e.g10.home.queue.body").textStyle(.g10Body13).foregroundStyle(Color.g10OnSurfaceVariant)
                .multilineTextAlignment(.center).frame(maxWidth: 240)
                .padding(.bottom, Spacing.s4)
            Button { isOnline = true } label: {
                Text("e.g10.home.queue.cta").textStyle(.g10Text14Semibold).foregroundStyle(.white)
                    .padding(.horizontal, Spacing.s5).frame(height: 40)
                    .background(Color.brandIndigo, in: RoundedRectangle(cornerRadius: Radius.md))
                    .shadow(color: .black.opacity(0.1), radius: 3, y: 1)
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .g10Card(padding: Spacing.s5)
        .padding(.vertical, 0)
    }

    private var tipCard: some View {
        HStack(alignment: .top, spacing: Spacing.s2_5) {
            G10Icon("IconG10Lightbulb", size: 20).foregroundStyle(Color.brandSaffron).padding(.top, 2)
            Text("e.g10.home.tip").textStyle(.g10CaptionRelaxed).foregroundStyle(Color.g10TipText)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(Spacing.s3_5)
        .background(Color.g10TipBackground, in: RoundedRectangle(cornerRadius: Radius.lg))
        .overlay(RoundedRectangle(cornerRadius: Radius.lg).strokeBorder(Color.g10TipBorder, lineWidth: BorderWidth.hairline))
    }

    // MARK: Online

    private var onlineContent: some View {
        Group {
            onlineCard
            performanceCard
            recentSection
            discoveryRow
        }
    }

    private var onlineCard: some View {
        VStack(spacing: 0) {
            HStack {
                HStack(spacing: Spacing.s2) {
                    G10PingDot(size: 12)
                    Text("e.g10.home.online.title").textStyle(.g10Title18Bold).foregroundStyle(Color.g10Ink)
                }
                Spacer(minLength: 0)
                G10Toggle(isOn: $isOnline)
            }
            .padding(.bottom, Spacing.s1_5)
            Text("e.g10.home.online.body").textStyle(.g10Body13).foregroundStyle(Color.g10GreenDark)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, Spacing.s3)
            HStack(spacing: Spacing.s2) {
                activeChannel(icon: "IconChat", title: "e.g10.home.channel.chat", rate: sample.chatRate)
                activeChannel(icon: "IconPhoneCall", title: "e.g10.home.channel.audio", rate: sample.audioRate)
                activeChannel(icon: "IconG10Video", title: "e.g10.home.channel.video", rate: sample.videoRate)
            }
            .padding(.top, Spacing.s3)
            .g10Rule(.top, color: .g10GreenSoft)
        }
        .padding(Spacing.s4)
        .background(
            LinearGradient(colors: [.g10GreenPale, .white], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl).strokeBorder(Color.g10GreenBorder, lineWidth: BorderWidth.hairline))
        .elevationSm()
    }

    private func activeChannel(icon: String, title: LocalizedStringKey, rate: String) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: Spacing.s1) {
                G10Icon(icon, size: 16)
                Text(title).textStyle(.g10Text11Bold)
            }
            .foregroundStyle(Color.g10GreenPressed).padding(.bottom, Spacing.s1)
            Text(verbatim: rate).textStyle(.g10Text11Bold).foregroundStyle(Color.brandIndigo)
            Text("e.g10.home.channel.active").textStyle(.g10Badge9).foregroundStyle(Color.statusOnlineDot)
        }
        .frame(maxWidth: .infinity)
        .padding(Spacing.s2)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.g10GreenBorder, lineWidth: BorderWidth.hairline))
        .elevationSm()
    }

    private var performanceCard: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 0) {
                    Text("e.g10.home.earnings.label").textStyle(.g10Caption).foregroundStyle(Color.g10OnSurfaceVariant)
                    Text(verbatim: sample.earnings).textStyle(.g10Display24).foregroundStyle(Color.g10Ink)
                }
                Spacer(minLength: 0)
                HStack(spacing: Spacing.s1) {
                    G10Icon("IconG10TrendingUp", size: 16).foregroundStyle(Color.brandSaffron)
                    Text(verbatim: sample.change).textStyle(.g10Text11Bold).foregroundStyle(Color.g10Amber)
                }
                .padding(.horizontal, Spacing.s2_5).padding(.vertical, Spacing.s1)
                .background(Color.g10AmberTint, in: Capsule())
                .overlay(Capsule().strokeBorder(Color.g10AmberBorder, lineWidth: BorderWidth.hairline))
            }
            .padding(.bottom, Spacing.s3)
            .g10Rule(.bottom, color: .g10Divider)
            G10StatRow {
                perfStat(sample.sessions, "e.g10.home.summary.sessions", color: .brandIndigo)
            } b: {
                perfStat(sample.rating, "e.g10.home.rating.label", color: .brandSaffron)
            } c: {
                perfStat(sample.onlineTime, "e.g10.home.summary.online", color: .brandIndigo)
            }
            .padding(.top, Spacing.s3)
        }
        .g10Card()
    }

    private func perfStat(_ value: String, _ label: LocalizedStringKey, color: Color) -> some View {
        VStack(spacing: 0) {
            Text(verbatim: value).textStyle(.g10Subhead).foregroundStyle(color)
            Text(label).textStyle(.g10Text11).foregroundStyle(Color.g10OnSurfaceVariant)
        }
    }

    private var recentSection: some View {
        VStack(spacing: Spacing.s2) {
            HStack {
                Text("e.g10.home.recent.title").textStyle(.g10Subhead).foregroundStyle(Color.g10OnSurface)
                Spacer(minLength: 0)
                Text("e.g10.home.recent.history").textStyle(.g10CaptionSemibold).foregroundStyle(Color.g10Amber)
            }
            .padding(.horizontal, Spacing.s1)
            HStack {
                HStack(spacing: Spacing.s3) {
                    G10Avatar(initials: sample.recentInitials, size: 40, fill: .brandIndigoTint,
                              foreground: .brandIndigo, style: .g10Text14Bold, shadow: false)
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: Spacing.s2) {
                            Text(verbatim: sample.recentName).textStyle(.g10SubheadBold).foregroundStyle(Color.g10OnSurface)
                            Text("e.g10.home.recent.chat").textStyle(.g10Text10Medium).foregroundStyle(Color.brandIndigo)
                                .padding(.horizontal, Spacing.s1_5)
                                .background(Color.brandIndigoTint, in: RoundedRectangle(cornerRadius: 4))
                        }
                        Text(verbatim: sample.recentMeta).textStyle(.g10Caption).foregroundStyle(Color.g10OnSurfaceVariant)
                    }
                }
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(verbatim: sample.recentAmount).textStyle(.g10SubheadBold).foregroundStyle(Color.statusOnlineDot)
                    Text("e.g10.home.recent.settled").textStyle(.g10Text11).foregroundStyle(Color.g10OnSurfaceVariant)
                }
            }
            .g10Card(radius: Radius.lg, padding: Spacing.s3_5)
        }
    }

    private var discoveryRow: some View {
        HStack {
            HStack(spacing: Spacing.s2_5) {
                G10Icon("IconG10Radar", size: 18).foregroundStyle(Color.brandIndigo)
                    .frame(width: 32, height: 32)
                    .background(Color.brandBackground, in: RoundedRectangle(cornerRadius: Radius.xs))
                    .overlay(RoundedRectangle(cornerRadius: Radius.xs).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
                VStack(alignment: .leading, spacing: 0) {
                    Text("e.g10.home.discovery.title").textStyle(.g10Body13Bold).foregroundStyle(Color.g10OnSurface)
                    Text("e.g10.home.discovery.body \(sample.discoveryCategory)").textStyle(.g10Text11)
                        .foregroundStyle(Color.g10OnSurfaceVariant)
                }
            }
            Spacer(minLength: 0)
            Circle().fill(Color.statusOnlineDot).frame(width: 8, height: 8)
        }
        .g10Card(radius: Radius.lg, padding: Spacing.s3, shadow: false)
    }
}
