import Foundation

enum APIConfig {
    /// Backend origin. Set `APIBaseURL` in `Config/Info-Additions.plist` (e.g. `http://203.0.113.10:4000`).
    /// Debug builds can still override it per run with `-apiBaseURL http://<host>:4000`.
    static var baseURL: URL {
        #if DEBUG
        if let override = UserDefaults.standard.string(forKey: "apiBaseURL"), let url = URL(string: override) { return url }
        #endif
        if let text = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String,
           let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)), url.host != nil { return url }
        return URL(string: "http://localhost:4000")!
    }
}
