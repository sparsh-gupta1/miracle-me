import SwiftUI

struct ExpertPermission: Identifiable {
    enum Kind: CaseIterable { case battery, background, microphone, camera }

    let kind: Kind
    var isGranted: Bool
    var id: Kind { kind }

    var icon: AppIcon {
        switch kind {
        case .battery: .bolt
        case .background: .refresh
        case .microphone: .mic
        case .camera: .camera
        }
    }
    var title: LocalizedStringKey {
        switch kind {
        case .battery: "perm.battery.title"
        case .background: "perm.background.title"
        case .microphone: "perm.mic.title"
        case .camera: "perm.camera.title"
        }
    }
    var detail: LocalizedStringKey {
        switch kind {
        case .battery: "perm.battery.body"
        case .background: "perm.background.body"
        case .microphone: "perm.mic.body"
        case .camera: "perm.camera.body"
        }
    }
}

/// A-06b — permissions an expert needs to receive calls reliably.
struct ExpertPermissionsView: View {
    let permissions: [ExpertPermission]
    let onGrantRemaining: () -> Void

    var body: some View {
        ScreenContainer {
            VStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    TopBar(bottomPadding: Spacing.s2) {
                        Text("perm.expert.chip")
                            .textStyle(.labelBold)
                            .foregroundStyle(.brandIndigo)
                            .padding(.horizontal, Spacing.s3)
                            .padding(.vertical, Spacing.s1)
                            .background(Color.brandSaffronTint, in: Capsule())
                            .overlay(Capsule().strokeBorder(Color.brandSaffron.opacity(0.3), lineWidth: BorderWidth.hairline))
                    }
                    VStack(alignment: .leading, spacing: Spacing.s1_5) {
                        Text("perm.expert.title").textStyle(.sectionTitle).foregroundStyle(.brandIndigo)
                        Text("perm.expert.body").textStyle(.smSnug).foregroundStyle(.textSecondary)
                    }
                    .padding(.top, Spacing.s3)
                    VStack(spacing: Spacing.s2_5) {
                        ForEach(permissions) { PermissionRow(permission: $0) }
                    }
                    .padding(.top, Spacing.s4)
                    RichText(key: "perm.expert.important", emphasis: .fineBold)
                        .textStyle(.fine)
                        .foregroundStyle(.brandIndigo)
                        .padding(Spacing.s2_5)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.brandSaffronTint, in: RoundedRectangle(cornerRadius: Radius.sm))
                        .overlay(RoundedRectangle(cornerRadius: Radius.sm).strokeBorder(Color.brandSaffron.opacity(0.3), lineWidth: BorderWidth.hairline))
                        .padding(.top, Spacing.s4)
                }
                Spacer(minLength: 0)
                PrimaryButton(title: "perm.expert.grant", action: onGrantRemaining).footerInset(Spacing.s4)
            }
        }
    }
}

private struct PermissionRow: View {
    let permission: ExpertPermission

    var body: some View {
        HStack(spacing: 0) {
            HStack(spacing: Spacing.s2_5) {
                IconTile(icon: permission.icon, tileSize: 28)
                VStack(alignment: .leading, spacing: 0) {
                    Text(permission.title).textStyle(.labelBold).foregroundStyle(.textPrimary)
                    Text(permission.detail).textStyle(.nano).foregroundStyle(.textSecondary)
                }
            }
            Spacer(minLength: Spacing.s2)
            StatusPill(tone: permission.isGranted ? .online : .busy,
                       title: permission.isGranted ? "perm.status.granted" : "perm.status.actionNeeded")
        }
        .surfaceCard()
    }
}

#Preview("Expert") {
    ExpertPermissionsView(
        permissions: [.init(kind: .battery, isGranted: true), .init(kind: .background, isGranted: false),
                      .init(kind: .microphone, isGranted: true), .init(kind: .camera, isGranted: true)],
        onGrantRemaining: {})
}
