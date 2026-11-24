import Foundation
import Security

/// Keychain-backed storage for the session tokens.
enum TokenStore {
    private static let service = "com.dapton.miracle-me.auth"

    static var accessToken: String? {
        get { read("accessToken") }
        set { write("accessToken", newValue) }
    }
    static var refreshToken: String? {
        get { read("refreshToken") }
        set { write("refreshToken", newValue) }
    }

    static func clear() {
        accessToken = nil
        refreshToken = nil
    }

    private static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
    }

    private static func read(_ key: String) -> String? {
        var request = query(key)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func write(_ key: String, _ value: String?) {
        SecItemDelete(query(key) as CFDictionary)
        guard let value, let data = value.data(using: .utf8) else { return }
        var item = query(key)
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(item as CFDictionary, nil)
    }
}
