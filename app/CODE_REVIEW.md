# Miracle Me (iOS) — Strict Code Review

Reviewed: 2026-11-19 · Branch `main` (no commits yet, everything untracked) · 10.6k lines Swift, SwiftUI, iOS 18.0+, Swift 6 mode
Build: `xcodebuild … -destination generic/platform=iOS Simulator` → **BUILD SUCCEEDED**, 65 warning lines (7 unique, see REL-11 and REL-14).
Third-party dependencies: **none** (no SPM references in `project.pbxproj`). The in-house Socket.IO client is a deliberate choice because the maintained-package check failed; nothing to audit under the stale-package rule.
Tests: **none** (no test target).

This document is written for a fixing agent. Each finding has an ID, exact location, what is wrong, why it matters, the fix, and how to verify. Paths are relative to `miracle-me/` unless they start with `Config/` or `miracle-me.xcodeproj/`. Line numbers are against the current tree.

## How the review was done (passes)

| # | Pass | Direction |
|---|------|-----------|
| 1 | Security | Trust boundaries, transport, token storage, session lifecycle, server-controlled content |
| 2 | App Store Review (ASR) | Review Guidelines 1.2, 2.1, 2.3, 3.1, 4.0, 5.1, privacy manifest, metadata and binary requirements |
| 3 | Correctness / concurrency | State machines (OTP, session request, socket), races, error mapping, money |
| 4 | Privacy / data handling | Consent, data minimisation, claims in copy versus behaviour |
| 5 | Quality | Tests, localisation, accessibility, dead code, build hygiene |
| 6 | Forward risk | Expert money/KYC screens are UI-only today; what must be true when they get wired |

## Severity scale

- **Blocker** — App Review will reject, or money/security is directly exposed. Fix before any submission.
- **High** — Wrong behaviour users or reviewers will hit, or a real security weakness.
- **Medium** — Should fix before release; has a workaround or needs specific conditions.
- **Low** — Hygiene, hardening, advisory.

## Summary

| Severity | Count | IDs |
|---|---|---|
| Blocker | 5 | ASR-01, ASR-02, ASR-03, ASR-04, ASR-05 |
| High | 11 | SEC-01, SEC-02, SEC-03, REL-01, REL-02, PRIV-01, ASR-06, ASR-07, ASR-08, QA-01, SEC-11 |
| Medium | 20 | SEC-04…SEC-08, SEC-12, REL-03…REL-09, ASR-09…ASR-11, QA-02…QA-04, PRIV-02 |
| Low | 17 | SEC-09/10/13…17, REL-10…15, ASR-12, PRIV-03/04, QA-05 |
| Forward | 5 | FWD-01…05 (expert money/KYC, not exploitable until wired) |

Recommended fix order: **Group A** (release safety: SEC-01/02/03, ASR-05) → **Group B** (store blockers: ASR-01…04, ASR-08) → **Group C** (core flow correctness: REL-01/02, PRIV-01, REL-03…) → **Group D** (security hardening) → **Group E** (quality/tests).

---

# Pass 1 — Security

### SEC-01 · High · Release builds honour an `apiBaseURL` override and default to `http://localhost`
- **Where:** `Core/Networking/APIConfig.swift:4-8`
- **Problem:** The base URL is read from `UserDefaults("apiBaseURL")` in every configuration, and the fallback is the plaintext `http://localhost:4000`. The bearer token (`APIClient.swift:54`) and the socket JWT (`SocketClient.swift:105`) go to whatever host that resolves to. There is no `#if DEBUG`.
- **Impact:** Anyone who can write the app's defaults (MDM profile, a managed device, a backup restore, a jailbroken device) redirects credentials to their own `https://` host (ATS permits HTTPS). A shipped build also cannot reach a real backend at all.
- **Fix:** Source the origin from a build setting (`API_BASE_URL` in per-configuration `.xcconfig`, surfaced via Info.plist). Keep the UserDefaults override only inside `#if DEBUG`. In Release, assert `scheme == "https"` and fail closed (crash in debug, show server-error screen in release).
- **Verify:** Release build with `defaults write com.dapton.miracle-me apiBaseURL https://evil.test` still calls the configured host (log host in a unit test of `APIConfig`).

### SEC-02 · High · ATS exception and plaintext `http`/`ws` apply to Release
- **Where:** `Config/Info-Additions.plist:5-10` (`NSAllowsLocalNetworking`), `APIConfig.swift:8`, `SocketClient.swift:76` (`ws` when base is `http`)
- **Problem:** The "demo backend on a Mac" exception is in the single shared plist, so it ships. Socket traffic (call requests, chat metadata) can run as unencrypted `ws://`.
- **Fix:** Debug-only plist (or `INFOPLIST_KEY` per configuration) for `NSAllowsLocalNetworking`. Release has no `NSAppTransportSecurity` at all. Force `wss` in Release.
- **Verify:** `plutil -p` on the Release `.app/Info.plist` has no `NSAppTransportSecurity`.

### SEC-03 · High · "Demo top-up" is reachable in production and the client chooses the amount
- **Where:** `Core/Networking/MiracleAPI.swift:50-55` (`POST /wallet/demo-topup`), `Features/Home/CustomerStore.swift:110-115`, `Features/Home/CustomerTabShell.swift:181-190`, `Features/Session/StartSessionSheet.swift:252` (button shown to any user with low balance)
- **Problem:** A real "Recharge ₹X" button credits the wallet with no payment. If the backend route exists in production, any user mints unlimited balance (money loss). Even if the backend blocks it, the app ships a fake payment path.
- **Fix:** Remove from Release (`#if DEBUG` around the API call, the store method and the recharge button), or replace with the real payment flow. Confirm with the backend owner that `/wallet/demo-topup` is disabled outside non-prod environments. Amount selection must stay a server-validated suggestion.
- **Verify:** `strings` on the Release binary does not contain `demo-topup`.

### SEC-04 · Medium · Keychain item accessibility and write semantics
- **Where:** `Core/Networking/TokenStore.swift:36-41`
- **Problems:**
  1. `kSecAttrAccessibleAfterFirstUnlock` (not `…ThisDeviceOnly`) lets tokens migrate via encrypted backup/restore to another device.
  2. `SecItemDelete` then `SecItemAdd` is non-atomic and the `SecItemAdd` status is ignored; a failed write leaves the user signed out with no signal. Concurrent callers can interleave delete/add.
  3. Keychain survives app deletion; a reinstall silently restores a stale session.
- **Fix:** Use `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`; `SecItemUpdate` with add-on-`errSecItemNotFound`; check/log (without values) the `OSStatus`; on first launch after install (flag in `UserDefaults`) call `TokenStore.clear()`.
- **Verify:** Unit test with a mocked store or a real keychain test: write/overwrite/clear round-trips; reinstall flow manually.

### SEC-05 · Medium · Refresh token is persisted but never used; no refresh flow
- **Where:** `TokenStore.swift:12-14`, `Core/AppSession.swift:31`, `APIClient.swift:72-77`
- **Problem:** A long-lived credential sits in the keychain with no consumer. Any 401 signs the user out (`.sessionExpired`), and the socket reconnects forever with the original access token (REL-03).
- **Fix:** Either implement a single-flight refresh (one in-flight refresh shared by concurrent 401s, retry the original request once, rotate both tokens, sign out only if refresh itself is rejected) or stop storing the refresh token until the backend supports it. Prefer implementing it; access tokens are short-lived by design.

### SEC-06 · Medium · Authorised responses are cached on disk by `URLSession.shared`
- **Where:** `APIClient.swift:46` (`session: URLSession = .shared`), `SocketClient.swift:78`
- **Problem:** `/user/me` (name, DOB, birth place, phone), `/wallet`, `/sessions` responses can land in `URLCache` on disk and survive sign-out.
- **Fix:** Inject a dedicated `URLSessionConfiguration.ephemeral` (or `urlCache = nil`, `requestCachePolicy = .reloadIgnoringLocalCacheData`) for the API session and the socket. Also call `URLCache.shared.removeAllCachedResponses()` in `AppSession.endSession()`.

### SEC-07 · Medium · A late 401 from a previous session signs out the new one
- **Where:** `APIClient.swift:72-77`
- **Problem:** The check is `authorized, TokenStore.accessToken != nil` evaluated *after* the response. A request launched before sign-out that returns 401 after the user signs in again posts `.sessionExpired` and kills the fresh session.
- **Fix:** Capture the token used for the request; only post `.sessionExpired` if it still equals `TokenStore.accessToken`.

### SEC-08 · Medium · Sign-out and rejection paths do not revoke the server session
- **Where:** `App/RootView.swift:158-162` (`reject`), `Core/Networking/MiracleAPI.swift:20-23` (`logout` uses `try?`), `AppSession.swift:55-63`
- **Problem:** Wrong-role sign-in (customer number on expert tab and vice versa) calls `endSession()` only: a valid access/refresh token pair was issued and stays valid server-side. Normal sign-out ignores a failed `logout` when offline.
- **Fix:** In `reject`, call `api.logout()` with the just-issued token before clearing. For offline sign-out, clear locally but queue the revocation (retry on next launch while a "pending revoke" token is held), or at minimum surface that sign-out could not be confirmed. Reset `pendingUserID`, `otp`, `isNewUser`, `mode` on sign-out (RootView.swift:164-171).

### SEC-09 · Low · Server-supplied IDs are interpolated into paths unvalidated
- **Where:** `MiracleAPI.swift:34-36`, `:64` (`/experts/\(id)`, `/intro-video/\(id)/…`), `APIClient.swift:51`
- **Problem:** `URL.appending(path:)` does not stop `..` segments. IDs come from the server, so exploitation needs a hostile/compromised backend, but defence in depth is cheap.
- **Fix:** Validate IDs against a strict pattern (e.g. `^[A-Za-z0-9_-]{1,64}$`) or build paths from percent-encoded segments with `urlPathAllowed` minus `/`.

### SEC-10 · Low · No certificate pinning for wallet/payout traffic (advisory)
- The app moves money and KYC data. At minimum require HTTPS (SEC-02). Consider pinning the leaf SPKI (with a backup pin and rotation plan) via `URLSessionDelegate` once the production host is fixed. Decide deliberately; pinning without rotation is an outage risk.

### SEC-11 · High · Intro video URL from the server is played without validation, and the player is rebuilt on every render
- **Where:** `App/RootView.swift:195-197` (`URL(string: text)`), `:80-82` (`VideoPlayer(player: AVPlayer(url:))` inside `fullScreenCover`)
- **Problem:** Any scheme (`file:`, `http:`, custom) is accepted from the backend. `AVPlayer(url:)` is created inside the closure, so every `RootView` re-evaluation (e.g. `session` state change) builds a new player and restarts playback; there is no pause/cleanup on dismiss and no `AVAudioSession` setup (mute switch).
- **Fix:** Require `https` (and optionally an allow-listed host). Create the `AVPlayer` once in a small `IntroPlayerView` (`@State`), `play()` on appear, `pause()` on disappear, set the playback audio session category.

### SEC-12 · Medium · Server-controlled text is parsed as Markdown (link injection)
- **Where:** `DesignSystem/Components/RichText.swift:19-21`; call sites that pass server data as args, e.g. `Features/Session/WaitingForExpertView.swift:313` (`args: [expert.name]`), `Features/Experts/ExpertProfileView.swift` (`ep.ratingReviews`)
- **Problem:** `String(format:)` merges the argument into the localised string, then the *whole* result is parsed as Markdown. An expert name like `Pt. [Pay here](https://evil.example)` renders as a tappable underlined link, or `**…**` restyles text.
- **Fix:** Escape Markdown metacharacters in `args` before formatting (`\ * _ [ ] ( ) \` ~`), or build the `AttributedString` by splitting the format on `%@`/`%1$@` and inserting args as plain runs. Use `AttributedString(markdown:options: .init(interpretedSyntax: .inlineOnly))` and strip `.link` on arg runs.
- **Verify:** Unit test: `RichText` attributed output for name `[x](https://e.com)` contains no link run.

### SEC-13 · Low · OTP code is 4 digits; client cannot show lock-out (advisory)
- **Where:** `DesignSystem/Components/OTPField.swift:10`, `App/RootView.swift:130`
- Entropy is 10⁴, so security depends entirely on server-side attempt limiting and expiry. The client turns every failure (network, 429, server error) into "incorrect code" (see REL-06). Confirm backend limits (attempts per `uuid`, per number, per IP) and make the client show lock-out/"try again later" distinctly.

### SEC-14 · Low · Server error strings are shown verbatim
- **Where:** `APIClient.swift:69-70`, `RootView.swift:136`
- `ErrorBody.message` goes straight to the UI (unlocalised, possibly internal wording). Map known status/code pairs to localised copy; keep the raw message for logs only.

### SEC-15 · Low · Multiple scenes enabled for a single-session app
- **Where:** `miracle-me.xcodeproj/project.pbxproj` (generated `UIApplicationSupportsMultipleScenes = YES`, confirmed in built Info.plist)
- Each iPad window builds its own `RootView` → separate `AppSession` and `SocketClient`, two sockets for one token and racing sign-outs. Set `INFOPLIST_KEY_UIApplicationSupportsMultipleScenes = NO` (or share one session).

### SEC-16 · Low · No screen-privacy handling (advisory, relevant once expert money/KYC is live)
- Add a blur/cover when `scenePhase != .active` on balance, payout, bank and document screens so the app-switcher snapshot doesn't show them. Consider `.privacySensitive()` on sensitive text.

### SEC-17 · Low · Socket reconnect/auth hardening
- See REL-03. Also: `AsyncStream` listeners are unbounded (`SocketClient.swift:46-52`, `:132`); a stalled consumer buffers events forever. Use `.bufferingNewest(n)`.

---

# Pass 2 — App Store Review (ASR)

### ASR-01 · Blocker · Terms / Privacy Policy / Expert Agreement links do nothing
- **Where:** `Resources/Localizable.xcstrings` keys `signin.legal`, `expert.legal` (links are `miracleme://terms`, `miracleme://privacy`, `miracleme://expert-agreement`); rendered by `RichText`
- **Problem:** The `miracleme://` scheme is not registered (no `CFBundleURLTypes`) and there is no `.onOpenURL`/`openURL` handler. Tapping does nothing. Guideline 5.1.1(i) requires the privacy policy to be reachable inside the app and in metadata. Third-party apps can also register the same scheme.
- **Fix:** Use real `https://` URLs (per environment from config) and open them in `SFSafariViewController` through an `OpenURLAction` set on the environment in `RootView`. Add Terms/Privacy/Support entries to the Profile/Settings screens too. Keep the same URLs in App Store Connect.
- **Verify:** UI test taps each link and asserts the sheet appears.

### ASR-02 · Blocker · No in-app account deletion
- **Where:** Customer Profile tab is a placeholder (`Features/Home/CustomerTabShell.swift:96-104`); expert profile has no delete.
- **Problem:** The app creates accounts (phone OTP) and collects PII. Guideline 5.1.1(v) requires in-app initiation of account deletion (not just deactivation or an email address).
- **Fix:** Profile → Delete account → confirmation (explain what is deleted/retained, e.g. financial records) → re-verify by OTP → `DELETE /user/me` → `TokenStore.clear()`, URL cache clear, return to sign-in. Needs a backend endpoint; same for expert accounts (payout/KYC retention rules must be stated).

### ASR-03 · Blocker · Placeholder, demo and mock content ships in the product
- **Where (non-exhaustive):**
  - Copy: `home.freeMinutes`, `onboarding.free.title/body` ("[X] free minutes"), `e.g12.perf.penaltyNote` ("[TO CONFIRM]"); `Features/Session/StartSessionSheet.swift:5-8` ("[X] min free", "₹150", "[N] minutes"); `Features/Favourites/FavouritesView.swift:18-20` ("₹[A]/min"); `Features/Experts/Expert.swift:36` price labels.
  - Customer tabs: Wallet and Profile are text placeholders (`CustomerTabShell.swift:96-104`); Favourites screen exists but is not in any tab; "Call again/Chat again" only reopens the profile.
  - Expert app: the entire expert side runs on hard-coded sample data — `Features/Expert/Shell/ExpertRoot.swift:4,22-46` (fake customer "Rahul Sharma", earnings ₹4,820, bank "HDFC ••••4092", PAN `ABCDE1234F`, sample withdrawal history). A real expert signing in sees someone else's financial data.
  - Dead controls: `Features/Home/HomeView.swift:73,120` (`Button {}`), `Features/Experts/ExpertProfileView.swift:42,44` (Share, More), `NoInternetView(onBack: {})`, `ExpertWithdrawView` `onConfirm` discards the request.
- **Impact:** Guideline 2.1 (App Completeness) and 2.3 (accurate metadata). Placeholder text and non-functional screens are a routine rejection reason; showing fake financial figures to a real expert is also misleading.
- **Fix:** Either wire each feature to the backend or hide it behind a build/feature flag that is off in Release (expert tabs, wallet, favourites). Replace all `[X]/[A]/[B]/[N]/[TO CONFIRM]` with real copy and values. Remove no-op buttons or implement them.

### ASR-04 · Blocker · No privacy manifest (`PrivacyInfo.xcprivacy`)
- **Where:** none exists in the project.
- **Problem:** The app uses required-reason APIs (`UserDefaults`: `Core/Networking/APIConfig.swift:7`, `@AppStorage` at `App/RootView.swift:12`). Missing reason declarations produce an upload warning/rejection (ITMS-91053). The manifest must also declare collected data types.
- **Fix:** Add `PrivacyInfo.xcprivacy` to the target: `NSPrivacyTracking = false`; `NSPrivacyAccessedAPITypes` → `NSPrivacyAccessedAPICategoryUserDefaults` reason `CA92.1`; `NSPrivacyCollectedDataTypes` for phone number, name, gender, date of birth, birth place/time, payment/financial info (wallet, payouts), user content (chat), device/photo ID for expert KYC when added, each linked to identity, not for tracking, purpose App Functionality. Keep App Store Connect "App Privacy" answers consistent with it. Re-audit if any SDK is added.

### ASR-05 · Blocker · The app cannot function for a reviewer
- **Where:** `APIConfig.swift`, `Config/Info-Additions.plist` (see SEC-01/02); `Features/OTP`
- **Problem:** Production default is `http://localhost:4000`; the sign-in is phone OTP, so a reviewer cannot log in. Guideline 2.1 requires a working demo path.
- **Fix:** Production HTTPS endpoint baked in for Release. Prepare a review account (fixed phone + fixed OTP, or a demo-login switch known to the backend only for that account) and put credentials in App Review Notes. Explain expert flow/test account the same way.

### ASR-06 · High · Missing app icon artwork
- **Where:** `Assets.xcassets/AppIcon.appiconset/Contents.json` references a 1024×1024 slot but the folder contains no image file.
- **Impact:** Upload fails validation (missing required icon) and TestFlight shows a blank icon.
- **Fix:** Add the 1024×1024 PNG (no alpha). Provide dark/tinted variants if desired.

### ASR-07 · High · User-generated chat has no moderation tools (Guideline 1.2)
- **Where:** chat/consultation features (`Features/Chats`, `Features/Expert/Inbox`, `Features/Expert/Sessions`), profile `More` button is a no-op (`ExpertProfileView.swift:44`)
- **Problem:** Apps with user-to-user content need a way to filter objectionable material, report content/users, block abusive users, and published contact info. None of these exist.
- **Fix:** Report and Block actions in expert profile, chat and call-recap screens (backend endpoints + confirmation), visible support contact, and server-side keyword/abuse handling. Add Terms clauses on prohibited content (ties to ASR-01).

### ASR-08 · High · Permission flow forces prompts and lists impossible permissions (Guideline 5.1.1(iv))
- **Where:** `App/RootView.swift:90-93`, `Core/PermissionService.swift:12-23`, `Features/Permissions/ExpertPermissionsView.swift`
- **Problem:** The expert screen has one button that requests microphone *and* camera in sequence with no skip. Battery and Background rows are permanently "Action needed" (`isGranted: false` hard-coded) because those are Android concepts, so the screen can never read as complete. Camera and microphone grants are never re-read after the system prompt, and a denial has no route to Settings. Buttons must not push users to grant access they can decline.
- **Fix:** Remove battery/background rows on iOS. Request mic and camera only at point of use (first call/video) with the purpose strings already in the plist; keep a "Not now" path. Re-read `AVCaptureDevice.authorizationStatus` after the prompt and show a Settings deep-link on `.denied`.

### ASR-09 · Medium · Payments classification must be decided and documented (Guidelines 3.1.1 / 3.1.3(d))
- **Where:** wallet top-up (`StartSessionSheet.swift:222-260`, `CustomerStore.recharge`), free-minute promotions
- **Problem:** Stored-value credit for in-app services is normally IAP territory. One-to-one live person-to-person services can use external payments (3.1.3(d)) but reviewers challenge prepaid wallets, bonuses and expiring credit. Not a code defect; it needs an explicit product/legal decision before the real payment gateway is wired.
- **Action:** Document the exemption rationale in review notes; do not use IAP-circumventing copy ("cheaper on web"); do not sell non-live digital content (reports, recordings) through the wallet without IAP.

### ASR-10 · Medium · Age gate and sensitive-data copy don't match behaviour (Guidelines 1.3, 5.1.1, 5.1.2)
- **Where:** `signin.legal` ("you confirm you are 18 or older"), `profile.ageNote`, `Features/Profile/ProfileSetupView.swift` (DOB optional)
- **Problem:** The 18+ claim is implied by tapping "Send code", but DOB is optional and never validated; copy promises "Listeners do not see your birth details" (`birth.share.body`) while the choice is never transmitted (PRIV-01).
- **Fix:** Add an explicit checkbox/confirmation for terms + 18+; if DOB is given, enforce ≥ 18 locally and server-side. Match the App Store age rating to the content (astrology/predictions, user chat).

### ASR-11 · Medium · iPad/orientation configuration doesn't match the UI
- **Where:** `project.pbxproj:176,181` — `TARGETED_DEVICE_FAMILY = "1,2"`, iPhone supports Landscape, iPad all four orientations
- **Problem:** Layouts are fixed-size, phone-portrait compositions (`frame(height: 52/56)`, `Spacer` stacks). iPad and landscape layouts are untested; reviewers test on iPad when it's declared (Guideline 4.0).
- **Fix:** Set `TARGETED_DEVICE_FAMILY = 1` and iPhone Portrait only, or design/test iPad and landscape. (Decide now; it also affects SEC-15.)

### ASR-12 · Low · Binary/metadata hygiene
- Add `ITSAppUsesNonExemptEncryption = NO` (standard HTTPS only) to skip export-compliance prompts. Add `UIBackgroundModes` (`audio`, `voip` + PushKit/CallKit) when calls are built; none today. Set `DEVELOPMENT_TEAM` (currently none; `CODE_SIGN_STYLE = Automatic`). Include font licences (Poppins, Noto Sans Devanagari, both OFL) in a Settings → Licences screen; no licence files exist in `Resources/Fonts`. Add an "entertainment/guidance, not professional advice" disclaimer where predictions are offered. Provide a localised App Store description consistent with the Hindi support.

---

# Pass 3 — Correctness, concurrency, reliability

### REL-01 · High · A missing quote falls back to fake figures and still allows Start
- **Where:** `Features/Session/StartSessionSheet.swift:5-8` (`SessionQuote` defaults "₹150", "[X] min free", "[N] minutes"), `:115` (`quotes[service] ?? SessionQuote()`), `Features/Home/CustomerStore.swift:96-108`
- **Problem:** `quotes(for:)` drops services whose quote request failed, but the sheet shows tiles for every rate and, when the selected service has no quote, displays a made-up balance and an enabled Start button (`:170`). The user can start a paid session on invented numbers.
- **Fix:** Remove the defaults. Show only services that have a quote (or a per-service loading/error state), disable Start until a quote for the selected service exists, and make the quote carry an expiry so it refreshes (balance can change while the sheet is open). The server must remain the authority on charging.
- **Verify:** Unit/UI test: stub quote failure for `.video`, select video → Start disabled, no placeholder text.

### REL-02 · High · Double-tapping Start creates duplicate, orphaned call requests
- **Where:** `Features/Home/CustomerTabShell.swift:193-198` (`begin`), `Features/Session/SessionRequestModel.swift:37-48`
- **Problem:** `begin` doesn't check `waiting`. Two quick taps create two `SessionRequestModel`s; both emit `call-request`. Only the last is tracked in `waiting`; `finish` ignores the first model's outcome (`guard waiting === request`), and nobody cancels it. The expert gets two requests; if the orphan is accepted the customer can be connected/charged with no UI.
- **Fix:** Guard `waiting == nil`; disable the button after first tap; cancel any previous request when replacing; ask backend for an idempotency key / reject a second open request per customer; make `cancel()` before `run()` effective (set the flag and check it at the start of `perform`).
- **Verify:** Test with a fake `SocketClient` that two taps emit exactly one `call-request`.

### REL-03 · Medium · Socket lifecycle gaps
- **Where:** `Core/Networking/SocketClient.swift`
- **Problems:**
  1. No Engine.IO ping watchdog (`handle` replies `3` to `2` but never reads `pingInterval/pingTimeout` from the open packet `0{…}`): a half-open connection looks `.connected` forever.
  2. `connect_error` (`case "4"`, :122) sets `.disconnected` but the loop keeps going; when the server closes, `receiveLoop` reconnects forever (`:97-100`) with the same possibly-expired JWT and never tells the app the session is dead.
  3. `emit` silently drops events when not connected (`:60-64`), including `call-request:cancel`, so a cancel during a blip is lost and the expert still rings.
  4. No handling of app background/foreground; reconnect relies on the OS closing the socket.
  5. `waitUntilConnected` polls every 100 ms on the main actor; and `state` can stay `.connecting` if `open` never gets `0`.
- **Fix:** Parse `pingInterval/pingTimeout`, schedule a deadline reset on each ping, reconnect when exceeded. On `connect_error` with an auth reason, stop retrying and post `.sessionExpired` (after a refresh attempt per SEC-05). Queue `cancel` until connected (bounded), or surface failure to caller. Observe `scenePhase` to disconnect on background and reconnect on active. Replace polling with a continuation-based state stream.

### REL-04 · Medium · Waiting state never reacts to a mid-wait disconnect
- **Where:** `SessionRequestModel.swift:50-82`
- **Problem:** Connectivity is checked only once at the start. If the socket drops while ringing, events are lost, the UI sits on the 30 s countdown, then falls back after +3 s (`CustomerTabShell.swift:206-211`) with "No response… You weren't charged", which may be false if the request was accepted while offline.
- **Fix:** Treat disconnect during `waiting` as `.failed("Connection lost")` and, on reconnect, re-query request status via REST (add an endpoint) before declaring an outcome. Don't assert "You weren't charged" unless the server said so.

### REL-05 · Medium · Launch error mapping hides real states
- **Where:** `Core/AppSession.swift:38-51`
- **Problem:** `restore()` maps everything except `.unauthorized` to `.unreachable` → "No internet". A deactivated account (403) never reaches `AccountInactiveView` (it is defined but referenced nowhere); a 5xx should show `ServerErrorView`.
- **Fix:** Return distinct cases for `.forbidden` (→ `AccountInactiveView` with real support contact data), `.server` (→ `ServerErrorView`) and `.network`. Wire `AccountInactiveView` and `AppUpdateView` (force/flexible, using `CFBundleShortVersionString` and a server `minVersion`) or remove them.

### REL-06 · Medium · OTP flow swallows errors and conflates timers
- **Where:** `App/RootView.swift:126-134`, `Features/OTP/OTPViewModel.swift:36-60`, `Features/OTP/OTPVerificationView.swift:25-27`
- **Problems:**
  1. `try? await session.verify(…)` turns network failure, 429 and server errors into "Incorrect code".
  2. Resend ignores failure (`try? await session.requestCode`) while the UI already reset the timer and cleared the code.
  3. The 30 s resend countdown is also treated as *code expiry* (`status = .expired`, `canVerify` false), blocking a still-valid code.
  4. Verify has no in-flight guard or spinner; double tap sends two verifications and the second (code consumed) can flash "incorrect" after success.
  5. `canVerify` allows tapping when `status == .incorrect` with the same code; fine, but no attempt counter.
- **Fix:** Make `verifier` return a typed result (`.success/.incorrect/.locked/.network`). Only reset the timer after a successful resend; show failure otherwise. Separate `resendCooldown` from `codeExpiry` (use the server's expiry). Add `isVerifying`.

### REL-07 · Medium · A 401 during onboarding is ignored and errors are swallowed
- **Where:** `App/RootView.swift:72-74` (only `.home/.expertHome` handled), `:178-190` (`save` catches, shows an alert, then continues to the next step regardless)
- **Problem:** Token expiry while on `.profile/.birth/.intro` clears credentials but leaves the user inside the flow; they proceed to `.home` with no session. Failed profile saves lose the user's input (draft is not retried).
- **Fix:** Handle `.sessionExpired` in every authenticated step. On save failure stay on the step and offer Retry/Skip; keep the draft.

### REL-08 · Medium · Only the first page of experts is ever loaded
- **Where:** `Features/Home/CustomerStore.swift:34`, `Core/Networking/DTOs.swift:69-71` (`hasMore` unused), search at `:68`
- **Fix:** Pagination (cursor/page) on Home and Search with load-more and an empty/error state; also expose "See all" (`HomeView.swift:120` is a no-op).

### REL-09 · Medium · Money is `Double` and formatting rounds incorrectly
- **Where:** `DTOs.swift:108,150` (`pricePerMinute`, `balance`), `Features/Experts/Expert+API.swift:27-29` (`"%.1f"`), `Features/Expert/Earnings/ExpertWithdrawView.swift:26-29` (`Double(amountText…)`, TDS maths)
- **Problem:** ₹7.25/min renders as "₹7.2/min"; balances accumulate binary error; locale is not applied (₹ + Indian grouping inconsistent).
- **Fix:** Represent money as integer paise or `Decimal` end-to-end (decode with `Decimal`), format with `FormatStyle` currency `INR` and `en_IN`. Do TDS/fee maths in `Decimal` with banker-free explicit rounding, or let the server compute and only display.

### REL-10 · Low · Favourite toggle can race
- **Where:** `CustomerStore.swift:81-92`
- **Problem:** The endpoint is a *toggle* (`POST /user/favorites` returns the new state). Two quick taps send two toggles; responses can arrive out of order and local state follows the last response processed.
- **Fix:** Serialise per-expert (in-flight guard / debounce) or use idempotent PUT/DELETE.

### REL-11 · Low · `where` clause binds only to `.loading`
- **Where:** `CustomerTabShell.swift:123` (`case .idle, .loading where store.experts.isEmpty:`) — compiler warning. `.idle` always shows the loader even with cached experts.
- **Fix:** `case .idle where store.experts.isEmpty, .loading where store.experts.isEmpty:`.

### REL-12 · Low · Silent failures in search/profile
- `CustomerStore.swift:50-58` swallows search errors (no error/empty state); `CustomerTabShell.swift:` `open(_:)` silently does nothing if the listing is not cached; `fullProfile` failure shows a half-empty profile with no retry.

### REL-13 · Low · Expert profile back arrow signs the user out
- **Where:** `Features/Expert/Shell/ExpertRoot.swift:30` (`onBack: onSignOut`), plus customer `Sign out` text button on a placeholder tab (`CustomerTabShell.swift:103`)
- **Fix:** Confirmation dialog at minimum; move to Settings.

### REL-14 · Low · Swift 6 / compiler warnings (7 unique)
- `APIClient.swift:33-44` — `ISO8601DateFormatter` captured in `@Sendable` closure (not Sendable). Replace with `Date.ISO8601FormatStyle` (`.iso8601`, with/without fractional seconds) or a per-call formatter inside the closure.
- `ExpertActiveCallView.swift:25`, `ExpertActiveChatView.swift:33`, `ExpertIncomingRequestView.swift:19` — `import Combine` missing for `Timer.publish`. Prefer a `TimelineView`/`.task` loop; the Combine timer keeps firing while off-screen.
- `CustomerTabShell.swift:123` — see REL-11.
- Target: zero warnings; enable `SWIFT_TREAT_WARNINGS_AS_ERRORS = YES` for Release.

### REL-15 · Low · `RootView` is a 200-line state machine holding view state, networking and session logic
- Extract a `RootViewModel`/`AuthFlow` (`@Observable @MainActor`) owning `step`, `pendingUserID`, `isNewUser`, OTP wiring and sign-out, so that SEC-08, REL-06 and REL-07 can be unit tested. Not urgent; do it while touching those findings.

---

# Pass 4 — Privacy and data handling

### PRIV-01 · High · The user's consent choices are collected and then thrown away
- **Where:** `Features/Profile/ProfileDraft.swift:18,20` (`approximatePeriod`, `sharesWithAstrologers`), `Core/AppSession.swift:90-109` (`birthUpdate` ignores them), `Features/Home/CustomerTabShell.swift:66` (`onStart: { service, _ in … }` drops `sharesBirthDetails`), `Features/Session/StartSessionSheet.swift:161-172`
- **Problem:** Two toggles promise control over whether birth details are shared ("Listeners do not see your birth details") and one picker records an approximate birth period for users who don't know their time. None reach the backend. The privacy UI is non-functional, which is both a trust defect and a risk if the backend defaults to sharing.
- **Fix:** Add the fields to `ProfileUpdate` / the session request (`call-request` payload) and persist them server-side. If the backend lacks them, remove the toggles and the copy until it does. Per-session share flag must be honoured by the server when delivering birth data to the expert.

### PRIV-02 · Medium · Consent and notice record for sensitive personal data
- **Problem:** Gender, DOB, birth time/place and phone are sensitive in practice (and are personal data under India's DPDP Act). There is no consent timestamp/version, no purpose notice at collection, no withdraw/export path (links to ASR-01/ASR-02).
- **Fix:** Send `consentVersion` + `consentedAt` with the first profile write; show the notice at collection; provide a way to withdraw (delete account/data).

### PRIV-03 · Low · PII lifetime in memory
- `ProfileDraft` (`@State` in `RootView`) holds PII until sign-out; `CustomerStore` caches listings/activities per view. Clear the draft after a successful save or skip, and on `.sessionExpired`.

### PRIV-04 · Low · Logging policy (preventive)
- No `print`/`NSLog`/`os_log` calls exist today (good). When logging is added (it will be, for SEC-04), use `os.Logger` with `privacy: .private` for identifiers and never log tokens, OTPs, phone numbers, bank/PAN data.

---

# Pass 5 — Quality: tests, localisation, accessibility, hygiene

### QA-01 · High · There is no test target
- **Where:** project has one target.
- **Fix:** Add a unit-test target (Swift Testing). Priority coverage: `APIClient` (status→`APIError`, 401 session rule, date decoding, query encoding) with a `URLProtocol` stub; `TokenStore` round-trip; `OTPViewModel` states and timers; `SocketClient` frame parsing/ping/reconnect with a fake transport; `SessionRequestModel` outcomes (accepted/rejected/timeout/cancel/duplicate); `ChatActivity.make`, `PriceFormat`, `ExpertQuery.parameters`; `RichText` escaping (SEC-12). Add a UI smoke test for sign-in → OTP → home using a stub server. Wire into CI.

### QA-02 · Medium · Hindi is offered as a first-class language but is mostly untranslated
- **Where:** `Resources/Localizable.xcstrings`
- **Measured:** 447 keys; 101 have a `hi` translation; **290 real (non-emoji, non-stale) keys have none**, including `chats.*`, `ep.*`, `session.*`, `intro.*`, `profile.*`, `birth.*`, `fav.*`, `filter.*`. `update.available` Hindi text drops the `%@` version argument. 120 keys carry `extractionState: stale` — several (`birth.step`, `action.continue`) are in use, so confirm via a clean extraction before deleting.
- **Hard-coded English in code paths:** `CustomerTabShell.swift` notice titles/messages (`:178-190`, `:100-104`), `Expert+API.swift` ("min free", "Listener", "Astrologer"), `CustomerStore.swift` ("m remaining", "Today,", "Yesterday,"), `ExpertWithdrawView.swift` ("Confirm & Request Payout", "Daily withdrawal limit"), accessibility labels (`"Back"`, `"Share"`, `"Favourite"`, `"More"`, `"Close"`).
- **Fix:** Complete `hi` for every user-visible key, add a CI check that fails on missing translations/format-specifier mismatch, move all literals into the catalog, use `RelativeDateTimeFormatter`/date styles instead of "Today," strings.

### QA-03 · Medium · Accessibility gaps
- **OTP input:** a `TextField` at `opacity(0.01)` and `1×1` frame (`OTPField.swift:14-19`) with four visual boxes. VoiceOver won't announce the field, the digits or the error. Add `accessibilityElement(children: .ignore)` on the boxes, a label ("4-digit code"), value (entered digits count), and keep the real field accessible.
- Only ~61 accessibility modifiers across 10k lines. Icon-only buttons need labels; status dots and tone colours need text alternatives; avatars (`ExpertAvatar`) are initials-in-circle with no label.
- **Dynamic Type:** fixed heights (`frame(height: 44/52/56/176)`) will clip at accessibility sizes; the monospaced style uses `.system(size:)` and does not scale (`Typography.swift:61-65`). Test at AX5, add `minHeight` instead of fixed height, `ViewThatFits` for rows.
- **Reduce Motion:** `.repeatForever` pulses (`OTPField.swift:25`, `WaitingForExpertView.swift:352`, `LoadingDots`) ignore `accessibilityReduceMotion`.
- **Contrast:** verify `textMuted`/`textFaint`/`statusBusyText` on tinted backgrounds against 4.5:1.

### QA-04 · Medium · Dead, mock and debug code ships in Release
- `Features/Expert/ExpertG1x.Gallery.swift` (4 files) aren't wrapped in `#if DEBUG` (only `ScreenGallery.swift` is), so they compile into Release along with the `Expert.samples`, `ChatActivity.samples`, `FavouriteExpert.samples` fixtures. Wrap gallery/sample code in `#if DEBUG` or move to a Preview/Debug-only group, and delete the unused `AppUpdateView`/`AccountInactiveView` or wire them (REL-05).

### QA-05 · Low · Misc.
- `PhotoPlaceholder` (`ProfileSetupView.swift:17`) looks tappable but does nothing; either implement `PhotosPicker` (no permission needed) with upload or remove.
- `ExpertRole` selection (`SignInView`) is never sent or validated server-side (`RootView.role` is unused): the astrologer/listener choice has no effect.
- Duplicate `private struct RequestSent`/`RequestRef` in `SessionRequestModel.swift:16-17` — same shape; merge.
- Socket event names (`call-request:*`) are string literals scattered in the model; centralise in a `SocketEvent.Name` enum.
- Repository: no commits yet; add `.gitignore` entries for `*.xcresult`, `.build/`; add SwiftLint/swift-format config and a CI workflow running build + tests.

---

# Pass 6 — Forward risk for the expert money/KYC screens

Not exploitable today (UI-only, sample data), but these must be true when `ExpertWithdrawView`, `ExpertBankAccountsView`, `ExpertDocumentsView` are wired:

- **FWD-01 Idempotent payouts.** `ExpertWithdrawView.swift:62` fires `onConfirm(amount)` on every tap; add an in-flight state and a client-generated idempotency key sent with the request. Server enforces limits (`available`, `dailyLimit`, `minimum`, TDS), the client's checks are UX only.
- **FWD-02 Step-up auth** for payout and bank changes (OTP re-verification or biometrics via `LocalAuthentication`), plus a cooling-off period/notification after a bank change.
- **FWD-03 Account number entry** (`ExpertBankAccountsView.swift:94-97`): the primary field is plain `TextField` and the confirm field is `SecureField`, so a typo is invisible; use matching secure entry or masked confirm with reveal toggle, `.textContentType(.none)`, `.autocorrectionDisabled()`, `.privacySensitive()`; validate IFSC with `^[A-Z]{4}0[A-Z0-9]{6}$` and account length; never prefill sample values (`BankLinkDraft.sample` has a full account number).
- **FWD-04 Masked KYC display** (`ExpertDocumentsView.swift:16`): show `ABCDE••••F`/last-4 only; upload via short-lived signed URLs; no local persistence of document images; strip EXIF; mask in screenshots/app switcher (SEC-16).
- **FWD-05 Do not store** PAN/Aadhaar/bank data in `UserDefaults`, logs, analytics or crash reports.

---

# Things done well (keep)

- No third-party dependencies; Swift 6 language mode, `@MainActor` isolation for stores/socket, `Sendable` DTOs.
- Tokens in Keychain, not `UserDefaults`; JWT sent in the Socket.IO auth payload, not the URL.
- `APIClient` has a timeout, maps errors to a typed `APIError`, and only treats a 401 on an authorised call as session loss.
- Debounced search with cancellation, optimistic favourite with server reconciliation, `sorted` query items for stable URLs.
- Clean design-system split (tokens → components → features); localisation via string catalog; font registration at launch.
- No logging of sensitive values; no web views, no custom URL handlers, no pasteboard use, no deep-link attack surface.

# Fix-agent checklist

| ID | Sev | Area | Done |
|---|---|---|---|
| SEC-01 | High | Debug-only base URL override, HTTPS in Release | ☐ |
| SEC-02 | High | Debug-only ATS exception, `wss` | ☐ |
| SEC-03 | High | Remove/guard demo top-up | ☐ |
| SEC-04 | Med | Keychain `ThisDeviceOnly`, update/clear semantics | ☐ |
| SEC-05 | Med | Token refresh or stop storing it | ☐ |
| SEC-06 | Med | Ephemeral session, clear URL cache | ☐ |
| SEC-07 | Med | 401 race | ☐ |
| SEC-08 | Med | Revoke server session on reject/sign-out | ☐ |
| SEC-09 | Low | Validate path IDs | ☐ |
| SEC-11 | High | Validate intro URL, own the player | ☐ |
| SEC-12 | Med | Markdown injection in `RichText` | ☐ |
| SEC-13/14/15/16/17 | Low | OTP lock-out UX, error mapping, scenes, privacy cover, stream buffering | ☐ |
| ASR-01 | Blocker | Real legal links in Safari VC | ☐ |
| ASR-02 | Blocker | In-app account deletion | ☐ |
| ASR-03 | Blocker | Remove placeholders/mock/dead UI | ☐ |
| ASR-04 | Blocker | `PrivacyInfo.xcprivacy` | ☐ |
| ASR-05 | Blocker | Production endpoint + reviewer account | ☐ |
| ASR-06 | High | App icon image | ☐ |
| ASR-07 | High | Report/block (UGC) | ☐ |
| ASR-08 | High | Permission flow | ☐ |
| ASR-09/10/11/12 | Med/Low | Payments rationale, age gate, device families, metadata | ☐ |
| REL-01 | High | No fake quote fallback | ☐ |
| REL-02 | High | Duplicate request guard | ☐ |
| REL-03…09 | Med | Socket, mid-wait disconnect, restore errors, OTP, onboarding 401, pagination, money | ☐ |
| REL-10…15 | Low | Favourite race, `where`, silent failures, back=sign-out, warnings, RootView split | ☐ |
| PRIV-01 | High | Persist or remove consent toggles | ☐ |
| PRIV-02/03/04 | Med/Low | Consent record, PII lifetime, logging policy | ☐ |
| QA-01 | High | Test target + CI | ☐ |
| QA-02…05 | Med/Low | Hindi, accessibility, dead code, misc | ☐ |
| FWD-01…05 | Forward | Payout/KYC requirements | ☐ |

## Limits of this review

- Static review plus a simulator build; the app was not run against a backend, and backend behaviour (rate limits, token lifetimes, endpoint availability, who can see birth data) is assumed from the client contract. Each item that depends on the backend says so.
- Visual/UX fidelity to the Figma design was not assessed.
- Legal conclusions (payments classification, DPDP) are flags for the owner, not legal advice.

---

# Demo-pass status (2026-11-19)

Scope agreed: client demo only. Blockers and placeholder content (ASR-01…05, PRIV-01, expert mock screens) are intentionally left as-is. Fixed because they cause inconsistent behaviour in a demo:

| ID | What changed |
|---|---|
| SEC-01 (part) | Base URL now comes from `APIBaseURL` in `Config/Info-Additions.plist`; the `apiBaseURL` UserDefaults override is Debug-only. |
| SEC-02 (demo) | `NSAllowsArbitraryLoads` added so the app can reach the demo server over plain HTTP on a public IP. **Remove before TestFlight/App Store** and move to HTTPS. |
| SEC-07 | A late 401 from an old token no longer signs out a newer session. |
| SEC-11 (part) | Intro video must be `https`; player is owned by `IntroPlayerView` so it no longer restarts on re-render. |
| REL-01 | No placeholder quote fallback; only services with a loaded quote are shown; the sheet picks a service that has a quote. |
| REL-02 | `begin` ignores a second Start tap while a request is waiting. |
| REL-03 (part) | Socket ping watchdog (reads `pingInterval/pingTimeout`), bounded event buffer. |
| REL-04 (part) | A disconnect while waiting ends the request with "Connection lost" instead of waiting for the countdown. |
| REL-06 (part) | OTP: network/server failure no longer shows "Incorrect code"; the 30 s timer is only a resend cooldown (code no longer "expires" at 30 s); verify has an in-flight guard. |
| REL-09 (part) | Prices keep two decimals (₹7.25 no longer shows as ₹7.2). |
| REL-11 | `where` clause bug fixed. |

Still open for later: everything else in this document, notably SEC-03 (demo top-up, needed for the demo and enabled only by backend `DEMO_MODE`), REL-05, REL-07, REL-08, and all ASR items.

Backend: see `miracle-me-backend-main/DEMO_DEPLOY.md` (Docker Compose bundle added: `Dockerfile`, `docker-compose.demo.yml`, `.env.demo.example`).
