import AVFoundation
import UserNotifications

enum PermissionService {
    static func requestNotifications() async {
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
    }

    static func requestCallAccess() async {
        _ = await AVCaptureDevice.requestAccess(for: .audio)
        _ = await AVCaptureDevice.requestAccess(for: .video)
    }

    /// Expert checklist. Battery and background-activity exemptions are Android concepts,
    /// so they stay "action needed" until the product decides what they mean on iOS.
    static func expertPermissions() -> [ExpertPermission] {
        [
            .init(kind: .battery, isGranted: false),
            .init(kind: .background, isGranted: false),
            .init(kind: .microphone, isGranted: AVCaptureDevice.authorizationStatus(for: .audio) == .authorized),
            .init(kind: .camera, isGranted: AVCaptureDevice.authorizationStatus(for: .video) == .authorized),
        ]
    }
}
