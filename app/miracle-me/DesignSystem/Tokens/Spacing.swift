import CoreGraphics

/// 4-pt spacing scale. Name = multiple of 4 (`s1_5` = 1.5 × 4 = 6).
enum Spacing {
    static let s0_5: CGFloat = 2
    static let s1: CGFloat = 4
    static let s1_5: CGFloat = 6
    static let s2: CGFloat = 8
    static let s2_5: CGFloat = 10
    static let s3: CGFloat = 12
    static let s3_5: CGFloat = 14
    static let s4: CGFloat = 16
    static let s5: CGFloat = 20
    static let s6: CGFloat = 24
    static let s8: CGFloat = 32
    static let s10: CGFloat = 40
}

enum Radius {
    static let xs: CGFloat = 8
    static let sm: CGFloat = 10
    static let md: CGFloat = 12
    static let lg: CGFloat = 14
    static let xl: CGFloat = 16
}

enum BorderWidth {
    static let hairline: CGFloat = 1
    static let selected: CGFloat = 1.5
    static let strong: CGFloat = 2
}

/// Sizes shared by more than one component.
enum Size {
    static let control: CGFloat = 48
    static let topBar: CGFloat = 40
}
