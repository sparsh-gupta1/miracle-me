import Foundation

extension Bundle {
    /// Looks a key up in the given locale's strings, independent of the device language.
    /// Falls back to the development language when the locale has no translation.
    func localizedString(_ key: String, locale: Locale) -> String {
        let code = locale.language.languageCode?.identifier ?? "en"
        for candidate in [code, "en"] {
            guard let path = path(forResource: candidate, ofType: "lproj"),
                  let bundle = Bundle(path: path) else { continue }
            let value = bundle.localizedString(forKey: key, value: "\u{0}", table: nil)
            if value != "\u{0}" { return value }
        }
        return key
    }
}
