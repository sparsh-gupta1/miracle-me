import SwiftUI

extension View {
    /// Sizes a sheet to its content height.
    func fittedSheet(cornerRadius: CGFloat = 20) -> some View { modifier(FittedSheet(cornerRadius: cornerRadius)) }
}

private struct FittedSheet: ViewModifier {
    let cornerRadius: CGFloat
    @State private var height: CGFloat = 420

    func body(content: Content) -> some View {
        content
            .fixedSize(horizontal: false, vertical: true)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
            .presentationDetents([.height(height)])
            .presentationCornerRadius(cornerRadius)
            .presentationBackground(Color.surface)
            .presentationDragIndicator(.hidden)
    }
}
