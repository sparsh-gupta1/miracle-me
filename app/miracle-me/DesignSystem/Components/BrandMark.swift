import SwiftUI

/// Lotus / rising-sun logo.
struct BrandMark: View {
    enum Variant {
        case splash   // 88 pt
        case compact  // 40 pt, heavier strokes, no pool line

        fileprivate var asset: String { self == .splash ? "BrandMark" : "BrandMarkCompact" }
        fileprivate var size: CGFloat { self == .splash ? 88 : 40 }
    }

    let variant: Variant

    var body: some View {
        Image(variant.asset)
            .resizable()
            .frame(width: variant.size, height: variant.size)
            .accessibilityHidden(true)
    }
}
