import SwiftUI

enum AppIcon: String {
    case chevronLeft = "IconChevronLeft"
    case check = "IconCheck"
    case bell = "IconBell"
    case bolt = "IconBolt"
    case mic = "IconMic"
    case camera = "IconCamera"
    case phone = "IconPhone"
    case refresh = "IconRefresh"
    case refreshBold = "IconRefreshBold"
    case warning = "IconWarning"
    case errorCircle = "IconErrorCircle"
    case infoRound = "IconInfoRound"
    case info = "InfoCircle"
    case arrowLeft = "IconArrowLeft"
    case wifiOff = "IconWifiOff"
    case shield = "IconShield"
    case shieldAlert = "IconShieldAlert"
    case rotate = "IconRotate"
    case infoSmall = "IconInfoSmall"
    case login = "IconLogin"
    case lock = "IconLock"
    case mail = "IconMail"
    case phoneCall = "IconPhoneCall"
    case download = "IconDownload"
    case rays = "IconRays"
    case close = "IconClose"
    case camera2 = "IconCamera2"
    case mapPin = "IconMapPin"
    case play = "IconPlay"
    case checkBold = "IconCheckBold"
    case bellOutline = "IconBellOutline"
    case search = "IconSearch"
    case chevronLeftSm = "IconChevronLeftSm"
    case chevronDown = "IconChevronDown"
    case sliders = "IconSliders"
    case home = "IconHome"
    case chat = "IconChat"
    case wallet = "IconWallet"
    case user = "IconUser"
    case share = "IconShare"
    case heart = "IconHeart"
    case heartFilled = "IconHeartFilled"
    case more = "IconMore"
    case clock = "IconClock"
    case bellRing = "IconBellRing"
    // Two-colour icons ignore foregroundStyle.
    case sunMark = "IconSunMark"
    case serverError = "IconServerError"
    case logoMini = "IconLogoMini"
}

/// Square vector icon. Tint with `.foregroundStyle`.
struct Icon: View {
    let icon: AppIcon
    let size: CGFloat

    init(_ icon: AppIcon, size: CGFloat) {
        self.icon = icon
        self.size = size
    }

    var body: some View {
        Image(icon.rawValue)
            .resizable()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}
