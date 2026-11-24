import SwiftUI

extension View {
    /// White card: hairline border, rounded corners, `shadow-sm`.
    func surfaceCard(radius: CGFloat = Radius.md, padding: CGFloat = Spacing.s3, shadow: Bool = true) -> some View {
        self.padding(padding)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
            .shadow(color: .black.opacity(shadow ? 0.05 : 0), radius: 1, y: 1)
    }
}
