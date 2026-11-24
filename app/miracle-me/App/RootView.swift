import SwiftUI

struct RootView: View {
    private enum Step { case splash, language, onboarding, signIn, otp, permissions, profile, birth, intro, home, expertHome, loggedOut, unreachable }

    private struct IntroPlayback: Identifiable {
        let url: URL
        var id: URL { url }
    }

    @AppStorage("appLanguage") private var language: AppLanguage = .english
    @State private var session = AppSession()
    @State private var step: Step = .splash
    @State private var mode: SignInMode = .customer
    @State private var phone = ""
    @State private var role: ExpertRole = .astrologer
    @State private var profile = ProfileDraft()
    @State private var otp = OTPViewModel(verifier: { _ in .incorrect })

    @State private var pendingUserID: String?
    @State private var isNewUser = false
    @State private var isSending = false
    @State private var signInError: String?
    @State private var saveFailed = false
    @State private var introVideo: IntroVideoDTO?
    @State private var playback: IntroPlayback?

    private var phoneDisplay: String { "+91 \(phone.prefix(5)) \(phone.dropFirst(5))" }

    var body: some View {
        ZStack {
            switch step {
            case .splash:
                SplashView()
            case .language:
                LanguageSelectionView(selection: $language) { step = .onboarding }
            case .onboarding:
                OnboardingView { step = .signIn }
            case .signIn:
                SignInView(mode: $mode, phone: $phone, role: $role, isSending: isSending, errorMessage: signInError,
                           onBack: { step = .onboarding }, onSendCode: sendCode)
            case .otp:
                OTPVerificationView(model: otp, phoneDisplay: phoneDisplay,
                                    onBack: { step = .signIn }, onChangeNumber: { step = .signIn },
                                    onVerified: didVerify)
            case .permissions:
                permissions
            case .profile:
                ProfileSetupView(draft: profile, onContinue: { save(.profile, then: .birth) }, onSkip: { step = .intro })
            case .birth:
                BirthDetailsView(draft: profile, onContinue: { save(.birth, then: .intro) }, onSkip: { step = .intro })
            case .intro:
                IntroVideoView(onPlay: playIntro, onGoHome: { step = .home })
            case .home:
                CustomerTabShell(session: session, onSignOut: signOut)
            case .expertHome:
                ExpertRoot(onSignOut: signOut)
            case .loggedOut:
                LoggedOutView(onLogIn: { step = .signIn })
            case .unreachable:
                NoInternetView(onBack: {}, onRetry: { step = .splash }, onOpenSettings: openSettings)
            }
        }
        .environment(\.locale, language.locale)
        .animation(.easeInOut(duration: 0.25), value: step)
        .task(id: step == .splash) { await launch() }
        .task(id: step == .intro) {
            guard step == .intro else { return }
            introVideo = try? await session.api.introVideo()
        }
        .onReceive(NotificationCenter.default.publisher(for: .sessionExpired)) { _ in
            if step == .home || step == .expertHome { step = .loggedOut }
        }
        .alert("Couldn't save your details", isPresented: $saveFailed) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("You can add them later from your profile.")
        }
        .fullScreenCover(item: $playback) { item in
            IntroPlayerView(url: item.url)
        }
    }

    @ViewBuilder private var permissions: some View {
        if mode == .customer {
            CustomerPermissionsView(
                onAllow: { Task { await PermissionService.requestNotifications(); step = .profile } },
                onSkip: { step = .profile })
        } else {
            ExpertPermissionsView(permissions: PermissionService.expertPermissions()) {
                Task { await PermissionService.requestCallAccess(); step = .expertHome }
            }
        }
    }

    // MARK: Launch

    /// Shows the splash for at least two seconds while restoring any stored session.
    private func launch() async {
        guard step == .splash else { return }
        let started = ContinuousClock.now
        let restored = await session.restore()
        let remaining = Duration.seconds(2) - (ContinuousClock.now - started)
        if remaining > .zero { try? await Task.sleep(for: remaining) }
        switch restored {
        case .signedIn(let user):
            mode = user.isExpert ? .expert : .customer
            step = user.isExpert ? .expertHome : .home
        case .signedOut: step = .language
        case .expired: step = .loggedOut
        case .unreachable: step = .unreachable
        }
    }

    // MARK: Sign in

    private func sendCode() {
        isSending = true
        signInError = nil
        Task {
            defer { isSending = false }
            do {
                let result = try await session.requestCode(mobile: phone)
                pendingUserID = result.userId
                isNewUser = result.isNewUser
                otp = OTPViewModel(
                    verifier: { code in
                        guard let id = pendingUserID else { return .incorrect }
                        do { _ = try await session.verify(userId: id, code: code); return .success }
                        catch APIError.network { return .unreachable }
                        catch let error as APIError { if case .server = error { return .unreachable }; return .incorrect }
                        catch { return .incorrect }
                    },
                    resender: {
                        if let result = try? await session.requestCode(mobile: phone) { pendingUserID = result.userId }
                    })
                step = .otp
            } catch let error as APIError {
                signInError = error == .network ? "Can't reach the server. Check your connection." : error.message
            } catch {
                signInError = "Something went wrong. Please try again."
            }
        }
    }

    /// The code was accepted: route by role and whether this is a first sign-in.
    private func didVerify() {
        guard let user = session.user else { return }
        if mode == .customer && user.isExpert {
            reject("This number belongs to an expert account. Switch to expert sign-in.")
        } else if mode == .expert && !user.isExpert {
            reject("This number isn't registered as an expert. Please contact support.")
        } else if mode == .customer, !isNewUser, !(user.name ?? "").isEmpty {
            step = .home
        } else {
            step = .permissions
        }
    }

    private func reject(_ message: String) {
        session.endSession()
        signInError = message
        step = .signIn
    }

    private func signOut() {
        Task {
            await session.signOut()
            phone = ""
            profile = ProfileDraft()
            signInError = nil
            step = .signIn
        }
    }

    // MARK: Profile

    private enum Section { case profile, birth }

    private func save(_ section: Section, then next: Step) {
        Task {
            do {
                switch section {
                case .profile: try await session.saveProfile(profile)
                case .birth: try await session.saveBirthDetails(profile)
                }
            } catch {
                saveFailed = true
            }
            step = next
        }
    }

    // MARK: Intro video

    private func playIntro() {
        guard let video = introVideo, let text = video.videoUrl, let url = URL(string: text), url.scheme == "https" else { return }
        playback = IntroPlayback(url: url)
        Task { await session.api.markIntroVideoViewed(id: video.id) }
    }

    private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
    }
}
