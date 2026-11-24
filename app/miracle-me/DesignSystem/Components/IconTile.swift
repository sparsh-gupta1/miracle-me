import SwiftUI

/// Rounded square holding a tinted icon.
struct IconTile: View {
    let icon: AppIcon
    var iconSize: CGFloat = 16
    var tileSize: CGFloat = 32
    var foreground: Color = .brandIndigo
    var background: Color = .brandIndigoTint

    var body: some View {
        Icon(icon, size: iconSize)
            .foregroundStyle(foreground)
            .frame(width: tileSize, height: tileSize)
            .background(background, in: RoundedRectangle(cornerRadius: Radius.xs))
    }
}
