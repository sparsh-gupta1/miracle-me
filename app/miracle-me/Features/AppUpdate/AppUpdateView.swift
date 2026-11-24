import SwiftUI

/// A-09 — forced (blocking) or flexible (dismissible) update prompt.
struct AppUpdateView: View {
    enum Kind { case force, flexible }

    let kind: Kind
    let version: String
    /// "What's new" bullets, supplied by the release metadata.
    let highlights: [String]
    var sizeMB: Int?
    let onUpdate: () -> Void
    var onLater: () -> Void = {}
    var onClose: () -> Void = {}

    private var isForce: Bool { kind == .force }

    var body: some View {
        StatusScreen(
            title: isForce ? "update.force.title" : "update.flex.title",
            message: isForce ? "update.force.body" : "update.flex.body",
            messageMaxWidth: 280,
            heroSpacing: Spacing.s5,
            messageSpacing: Spacing.s5,
            actionSpacing: Spacing.s2_5
        ) {
            if isForce {
                BrandLockup(iconSize: 20, style: .xsBold)
                Spacer(minLength: 0)
                TagChip(tone: .indigoOutlined) { RichText(key: "update.available", args: [version]) }
            } else {
                TagChip(tone: .emeraldOutlined) { Text("update.flex.chip") }
                Spacer(minLength: 0)
                RoundIconButton(icon: .close, label: "Close", action: onClose)
            }
        } hero: {
            StatusHero(outerFill: isForce ? .brandSaffronTint : .brandIndigoTint, innerFill: .surface, innerBorder: .init()) {
                Icon(isForce ? .download : .rays, size: 38)
                    .foregroundStyle(isForce ? Color.brandSaffron : Color.brandIndigo)
            }
        } info: {
            whatsNew
        } actions: {
            PrimaryButton(title: isForce ? "update.force.action" : "update.flex.action", radius: Radius.md, action: onUpdate)
            if isForce {
                storeLine
            } else {
                TextButton(title: "update.flex.later", color: .textSecondary, action: onLater)
            }
        }
    }

    private var whatsNew: some View {
        VStack(alignment: .leading, spacing: Spacing.s2_5) {
            Text("update.whatsNew")
                .textStyle(.xsSemiboldCaps)
                .textCase(.uppercase)
                .foregroundStyle(.textPrimary)
            VStack(alignment: .leading, spacing: Spacing.s2) {
                ForEach(highlights.indices, id: \.self) { index in
                    HStack(alignment: .top, spacing: Spacing.s2) {
                        Circle()
                            .fill(isForce ? Color.brandSaffron : Color.brandIndigo)
                            .frame(width: 6, height: 6)
                            .padding(.top, Spacing.s1_5)
                        Text(verbatim: highlights[index]).textStyle(.xs).foregroundStyle(.textPrimary)
                    }
                }
            }
        }
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, alignment: .leading)
        .surfaceCard(padding: Spacing.s4)
    }

    @ViewBuilder private var storeLine: some View {
        Group {
            if let sizeMB { RichText(key: "update.store", args: [String(sizeMB)]) } else { Text(verbatim: "App Store") }
        }
        .textStyle(.micro)
        .foregroundStyle(.textSecondary)
    }
}

private let previewHighlights = ["[What's new item 1]", "[What's new item 2]"]

#Preview("Force") {
    AppUpdateView(kind: .force, version: "2.1.0",
                  highlights: previewHighlights + ["Important stability and consultation enhancements"],
                  sizeMB: 18, onUpdate: {})
}
#Preview("Flexible") {
    AppUpdateView(kind: .flexible, version: "2.1.0",
                  highlights: previewHighlights + ["Seamless video and audio call optimization"], onUpdate: {})
}
#Preview("Force · Hindi") {
    AppUpdateView(kind: .force, version: "2.1.0",
                  highlights: previewHighlights + ["परामर्श और नेटवर्क स्थिरता में महत्वपूर्ण सुधार"],
                  sizeMB: 18, onUpdate: {})
        .environment(\.locale, AppLanguage.hindi.locale)
}
