import SwiftUI

struct ExpertAvatar: View {
    enum Size {
        case compact   // 36, home "online now" tile and sheet header
        case regular   // 40, cards and chat rows
        case medium    // 44, favourites
        case large     // 64, profile header
        case hero      // 96, waiting screen

        fileprivate var diameter: CGFloat {
            switch self {
            case .compact: 36
            case .regular: 40
            case .medium: 44
            case .large: 64
            case .hero: 96
            }
        }
        fileprivate var dot: CGFloat {
            switch self {
            case .compact: 8
            case .regular, .medium: 10
            case .large: 14
            case .hero: 0
            }
        }
        fileprivate var dotBorder: CGFloat { self == .compact ? BorderWidth.hairline : BorderWidth.strong }
        fileprivate var style: TextStyle {
            switch self {
            case .compact, .regular: .xsBold
            case .medium: .compactButton
            case .large: .avatarLarge
            case .hero: .avatarHero
            }
        }
    }

    let expert: Expert
    var size: Size = .regular
    /// Shows the presence dot (online / busy / offline).
    var showsStatus = true
    /// Background behind the dot's ring; match the surface the avatar sits on.
    var ringColor: Color = .surface

    var body: some View {
        let fill = expert.tint == .lavender ? Color.avatarLavender : Color.avatarPeach
        Text(verbatim: expert.initials)
            .textStyle(size.style)
            .foregroundStyle(.brandIndigo)
            .frame(width: size.diameter, height: size.diameter)
            .background(fill, in: Circle())
            .overlay { outline }
            .overlay(alignment: .bottomTrailing) {
                if showsStatus && size.dot > 0 {
                    Circle().fill(expert.status.tone.dot)
                        .frame(width: size.dot, height: size.dot)
                        .overlay(Circle().strokeBorder(ringColor, lineWidth: size.dotBorder))
                }
            }
            .accessibilityHidden(true)
    }

    @ViewBuilder private var outline: some View {
        switch size {
        case .large:
            Circle().strokeBorder(expert.tint == .lavender ? Color.borderAvatarLavender : Color.borderAvatarPeach,
                                  lineWidth: BorderWidth.hairline)
        case .hero:
            Circle().strokeBorder(Color.surface, lineWidth: 4)
        default:
            EmptyView()
        }
    }
}
