import SwiftUI

extension View {
    /// Tailwind `shadow-sm`: 0 1px 2px rgba(0,0,0,.05)
    func elevationSm() -> some View {
        shadow(color: .black.opacity(0.05), radius: 1, x: 0, y: 1)
    }
}
