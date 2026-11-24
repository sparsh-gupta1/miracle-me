import Foundation
import Observation

@Observable
@MainActor
final class OTPViewModel {
    enum Status { case entering, incorrect, expired, unreachable }
    enum VerifyResult { case success, incorrect, unreachable }

    static let resendInterval = 30

    var code = "" {
        didSet { if status == .incorrect || status == .unreachable, code != oldValue { status = .entering } }
    }
    private(set) var status: Status = .entering
    private(set) var secondsLeft: Int
    private(set) var resendCount = 0
    private(set) var isVerifying = false

    /// Resolves to `true` when the code is correct. Injected so the screen stays backend-agnostic.
    private let verifier: (String) async -> VerifyResult
    /// Asks the backend for a fresh code when the user taps "resend".
    private let resender: () async -> Void

    init(code: String = "", status: Status = .entering, secondsLeft: Int = OTPViewModel.resendInterval,
         verifier: @escaping (String) async -> VerifyResult, resender: @escaping () async -> Void = {}) {
        self.code = code
        self.status = status
        self.secondsLeft = secondsLeft
        self.verifier = verifier
        self.resender = resender
    }

    var canVerify: Bool { code.count == OTPField.length && status != .expired && !isVerifying }
    /// The resend cooldown is over. It is not code expiry: the server accepts the code for much longer.
    var canResend: Bool { secondsLeft == 0 }
    var timerText: String { String(format: "%02d:%02d", secondsLeft / 60, secondsLeft % 60) }

    /// Counts the resend timer down; call from a `.task`.
    func runTimer() async {
        while secondsLeft > 0, !Task.isCancelled {
            try? await Task.sleep(for: .seconds(1))
            secondsLeft -= 1
        }
    }

    func resend() {
        code = ""
        status = .entering
        secondsLeft = Self.resendInterval
        resendCount += 1
        Task { await resender() }
    }

    /// Returns `true` on success; otherwise flips to the incorrect state.
    func verify() async -> Bool {
        guard canVerify else { return false }
        isVerifying = true
        defer { isVerifying = false }
        switch await verifier(code) {
        case .success: return true
        case .incorrect: status = .incorrect
        case .unreachable: status = .unreachable
        }
        return false
    }
}
