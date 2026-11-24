import SwiftUI

struct ExpertSettings: Equatable {
    var language: String
    var theme: String
    var notifications: String
    var microphoneGranted: Bool
    var cameraGranted: Bool
    var highPriorityRingtone: Bool
    var autoAnswer: Bool
    var mobile: String
    var email: String
    var twoFactor: String
    var appVersion: String
}

extension ExpertSettings {
    static let sample = ExpertSettings(
        language: "English", theme: "Light Theme (Default)", notifications: "Sound & Vibrate",
        microphoneGranted: true, cameraGranted: true, highPriorityRingtone: true, autoAnswer: false,
        mobile: "+91 98765 43210", email: "keshav.astrology@gmail.com", twoFactor: "Active (SMS OTP)",
        appVersion: "v2.4.1 (Expert Build)")
}

/// E-17 — settings & preferences.
struct ExpertSettingsView: View {
    @State private var settings: ExpertSettings
    var onBack: () -> Void = {}
    var onLanguage: () -> Void = {}
    var onTheme: () -> Void = {}
    var onNotifications: () -> Void = {}
    var onTerms: () -> Void = {}
    var onConduct: () -> Void = {}
    var onDeactivate: () -> Void = {}
    var onChange: (ExpertSettings) -> Void = { _ in }

    init(settings: ExpertSettings, onBack: @escaping () -> Void = {}, onLanguage: @escaping () -> Void = {},
         onTheme: @escaping () -> Void = {}, onNotifications: @escaping () -> Void = {},
         onTerms: @escaping () -> Void = {}, onConduct: @escaping () -> Void = {},
         onDeactivate: @escaping () -> Void = {}, onChange: @escaping (ExpertSettings) -> Void = { _ in }) {
        _settings = State(initialValue: settings)
        self.onBack = onBack
        self.onLanguage = onLanguage
        self.onTheme = onTheme
        self.onNotifications = onNotifications
        self.onTerms = onTerms
        self.onConduct = onConduct
        self.onDeactivate = onDeactivate
        self.onChange = onChange
    }

    var body: some View {
        VStack(spacing: 0) {
            G13AppBar(title: "e.g13.settings.title", onBack: onBack)
            ScrollView {
                VStack(spacing: Spacing.s4) {
                    preferences
                    hardware
                    account
                    legal
                    danger
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.top, Spacing.s1)
                .padding(.bottom, Spacing.s6)
            }
            .scrollIndicators(.hidden)
        }
        .background(Color.brandBackground.ignoresSafeArea())
        .onChange(of: settings) { _, new in onChange(new) }
    }

    // MARK: Sections

    private func section<Content: View>(_ title: LocalizedStringKey, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s1_5) {
            Text(title).textStyle(.g13CaptionCaps).textCase(.uppercase).foregroundStyle(Color.g13Outline)
                .padding(.horizontal, Spacing.s1)
            content()
        }
    }

    private var preferences: some View {
        section("e.g13.settings.preferences") {
            VStack(spacing: 0) {
                navRow(icon: { G13Icon("IconG13Globe", size: 18) }, title: "e.g13.settings.language", value: settings.language, action: onLanguage)
                G13Divider().padding(.horizontal, Spacing.s3)
                navRow(icon: { G13Icon("IconG13Sun", size: 18) }, title: "e.g13.settings.theme", value: settings.theme, action: onTheme)
                G13Divider().padding(.horizontal, Spacing.s3)
                navRow(icon: { Icon(.bell, size: 18) }, title: "e.g13.settings.notifications", value: settings.notifications,
                       valueMaxWidth: 110, action: onNotifications)
            }
            .g13Card()
        }
    }

    private func navRow<I: View>(@ViewBuilder icon: () -> I, title: LocalizedStringKey, value: String,
                                 valueMaxWidth: CGFloat? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                HStack(spacing: Spacing.s2_5) {
                    icon().foregroundStyle(Color.g13Primary)
                    Text(title).textStyle(.g13Body).foregroundStyle(Color.g13OnSurface)
                }
                Spacer(minLength: Spacing.s2)
                HStack(spacing: Spacing.s1) {
                    Text(verbatim: value).textStyle(.g13Caption).lineLimit(1)
                        .frame(maxWidth: valueMaxWidth, alignment: .trailing)
                    G13Icon("IconG13ChevronRight", size: 16)
                }
                .foregroundStyle(Color.g13OnSurfaceVariant)
            }
            .padding(.horizontal, Spacing.s3)
            .frame(height: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var hardware: some View {
        section("e.g13.settings.hardware") {
            VStack(spacing: Spacing.s3) {
                permissionRow(icon: { Icon(.mic, size: 18) }, title: "e.g13.settings.microphone", granted: settings.microphoneGranted)
                G13Divider()
                permissionRow(icon: { G13Icon("IconG13Video", size: 18) }, title: "e.g13.settings.camera", granted: settings.cameraGranted)
                G13Divider()
                HStack(alignment: .top, spacing: Spacing.s2) {
                    VStack(alignment: .leading, spacing: Spacing.s0_5) {
                        HStack(spacing: Spacing.s2) {
                            Icon(.phoneCall, size: 18).foregroundStyle(Color.g13Primary)
                            Text("e.g13.settings.ringtone").textStyle(.g13BodyMedium).foregroundStyle(Color.g13OnSurface)
                        }
                        Text("e.g13.settings.ringtoneHint").textStyle(.g13Caption11).foregroundStyle(Color.g13OnSurfaceVariant)
                    }
                    Spacer(minLength: 0)
                    G13Switch(isOn: $settings.highPriorityRingtone).padding(.top, Spacing.s0_5)
                }
                G13Divider()
                HStack {
                    HStack(spacing: Spacing.s2) {
                        G13Icon("IconG13PhoneIncoming", size: 18).foregroundStyle(Color.g13Primary)
                        Text("e.g13.settings.autoAnswer").textStyle(.g13Body).foregroundStyle(Color.g13OnSurface)
                    }
                    Spacer(minLength: 0)
                    G13Switch(isOn: $settings.autoAnswer)
                }
            }
            .g13Card(padding: Spacing.s3)
        }
    }

    private func permissionRow<I: View>(@ViewBuilder icon: () -> I, title: LocalizedStringKey, granted: Bool) -> some View {
        HStack {
            HStack(spacing: Spacing.s2) {
                icon().foregroundStyle(Color.g13Primary)
                Text(title).textStyle(.g13Body).foregroundStyle(Color.g13OnSurface)
            }
            Spacer(minLength: 0)
            HStack(spacing: Spacing.s1) {
                G13Icon("IconG13CheckCircle", size: 14)
                Text(granted ? "e.g13.settings.granted" : "e.g13.settings.notGranted").textStyle(.g13Caption)
            }
            .foregroundStyle(Color.g13TertiaryFixedDim)
            .padding(.horizontal, Spacing.s2).padding(.vertical, Spacing.s0_5)
            .background(Color.g13TertiaryContainer, in: Capsule())
        }
    }

    private var account: some View {
        section("e.g13.settings.account") {
            VStack(spacing: Spacing.s2) {
                HStack {
                    Text("e.g13.settings.mobile").textStyle(.g13Caption).foregroundStyle(Color.g13OnSurfaceVariant)
                    Spacer(minLength: 0)
                    Text(verbatim: settings.mobile).textStyle(.g13BodyMedium).foregroundStyle(Color.g13OnSurface)
                }
                G13Divider()
                HStack {
                    Text("e.g13.settings.email").textStyle(.g13Caption).foregroundStyle(Color.g13OnSurfaceVariant)
                    Spacer(minLength: Spacing.s2)
                    Text(verbatim: settings.email).textStyle(.g13CaptionMedium).foregroundStyle(Color.g13OnSurface)
                        .lineLimit(1).frame(maxWidth: 180, alignment: .trailing)
                }
                G13Divider()
                HStack {
                    Text("e.g13.settings.twoFactor").textStyle(.g13Caption).foregroundStyle(Color.g13OnSurfaceVariant)
                    Spacer(minLength: 0)
                    HStack(spacing: Spacing.s1) {
                        Icon(.shield, size: 14)
                        Text(verbatim: settings.twoFactor).textStyle(.g13CaptionSemibold)
                    }
                    .foregroundStyle(Color.statusOnlineDot)
                }
            }
            .g13Card(padding: Spacing.s3)
        }
    }

    private var legal: some View {
        VStack(spacing: 0) {
            legalRow("e.g13.settings.terms", action: onTerms)
            G13Divider().padding(.horizontal, Spacing.s3)
            legalRow("e.g13.settings.conduct", action: onConduct)
            G13Divider().padding(.horizontal, Spacing.s3)
            HStack {
                Text("e.g13.settings.version").textStyle(.g13Caption).foregroundStyle(Color.g13OnSurfaceVariant)
                Spacer(minLength: 0)
                Text(verbatim: settings.appVersion).textStyle(.g13CaptionSemibold).foregroundStyle(Color.g13Outline)
            }
            .padding(.horizontal, Spacing.s3).frame(height: 44)
            .background(Color.g13SurfaceContainerLow)
        }
        .g13Card()
        .clipShape(RoundedRectangle(cornerRadius: Radius.md))
    }

    private func legalRow(_ title: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(title).textStyle(.g13Body).foregroundStyle(Color.g13OnSurface)
                Spacer(minLength: 0)
                G13Icon("IconG13ChevronRight", size: 16).foregroundStyle(Color.g13Outline)
            }
            .padding(.horizontal, Spacing.s3).frame(height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var danger: some View {
        VStack(spacing: Spacing.s1_5) {
            Button(action: onDeactivate) {
                HStack(spacing: Spacing.s2) {
                    G13Icon("IconG13UserX", size: 18)
                    Text("e.g13.settings.deactivate").textStyle(.g13Subhead)
                }
                .foregroundStyle(Color.statusCritical)
                .frame(maxWidth: .infinity).frame(height: 48)
                .overlay(RoundedRectangle(cornerRadius: Radius.lg).strokeBorder(Color.statusCritical, lineWidth: BorderWidth.selected))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Text("e.g13.settings.deactivateHint").textStyle(.g13Caption10).foregroundStyle(Color.g13Outline)
                .multilineTextAlignment(.center)
        }
        .padding(.top, Spacing.s2)
    }
}

#Preview("E-17 Settings") { ExpertSettingsView(settings: .sample) }
