import SwiftUI

struct ServicePriceRow: Identifiable, Hashable {
    enum Service { case chat, audio, video }

    let service: Service
    /// "Allowed: ₹15 to ₹40 / min"
    let allowedText: String
    /// Price shown big, e.g. "₹20.00".
    let priceText: String
    /// Expert's take, e.g. "₹16.00 / min".
    let earnText: String

    var id: Service { service }
}

/// E-14 — my consultation prices.
struct ExpertPricesView: View {
    enum Tier: Hashable { case astrologer, listener }

    let rows: [ServicePriceRow]
    @State var tier: Tier = .astrologer
    var onBack: () -> Void = {}
    var onSave: () -> Void = {}

    var body: some View {
        G12Screen {
            G12Header(title: "e.g12.prices.title", onBack: onBack) {
                G12IconButton(icon: "IconG12Save", size: 18, label: "Save", action: onSave)
            }
        } content: {
            tierPicker
            feeNote
            ForEach(rows) { row in serviceCard(row) }
            G12PrimaryButton(title: "e.g12.prices.save", action: onSave).padding(.top, Spacing.s1)
        }
    }

    private var tierPicker: some View {
        HStack(spacing: 0) {
            tierButton("e.g12.prices.astrologerTier", .astrologer)
            tierButton("e.g12.prices.listenerTier", .listener)
        }
        .padding(Spacing.s1)
        .background(Color.g12Pill, in: RoundedRectangle(cornerRadius: Radius.xs))
    }

    private func tierButton(_ title: LocalizedStringKey, _ value: Tier) -> some View {
        let selected = tier == value
        return Button { tier = value } label: {
            Text(title).textStyle(selected ? .g12TierActive : .g12Tier)
                .foregroundStyle(selected ? Color.white : Color.g12Body)
                .frame(maxWidth: .infinity).frame(height: 32)
                .background { if selected { RoundedRectangle(cornerRadius: 6).fill(Color.brandIndigo) } }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var feeNote: some View {
        VStack(alignment: .leading, spacing: Spacing.s0_5) {
            Text("e.g12.prices.feeTitle").textStyle(.g12Para12).foregroundStyle(.brandIndigo)
            Text("e.g12.prices.feeBody").textStyle(.g12Para11).foregroundStyle(.g12Body)
        }
        .padding(Spacing.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.g12Note, in: RoundedRectangle(cornerRadius: Radius.sm))
        .overlay(RoundedRectangle(cornerRadius: Radius.sm).strokeBorder(Color.g12NoteBorder, lineWidth: BorderWidth.hairline))
    }

    private func serviceCard(_ row: ServicePriceRow) -> some View {
        let style = row.service.style
        return VStack(spacing: Spacing.s2) {
            HStack {
                HStack(spacing: Spacing.s2) {
                    G12Icon(name: style.icon, size: 15).foregroundStyle(style.tint)
                        .frame(width: 28, height: 28)
                        .background(style.tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 6))
                    VStack(alignment: .leading, spacing: 0) {
                        Text(style.title).textStyle(.g12Item13).foregroundStyle(.brandIndigo)
                        Text(verbatim: row.allowedText).textStyle(.g12Caption105).foregroundStyle(.g12Muted)
                    }
                }
                Spacer(minLength: Spacing.s2)
                HStack(alignment: .firstTextBaseline, spacing: Spacing.s1) {
                    Text(verbatim: row.priceText).textStyle(.compactButton).foregroundStyle(.brandIndigo)
                    Text("e.g12.prices.perMin").textStyle(.g12NanoMedium).foregroundStyle(.g12Muted)
                }
            }
            HStack {
                Text("e.g12.prices.youEarn").textStyle(.g12Row115).foregroundStyle(.g12Body)
                Spacer(minLength: Spacing.s2)
                Text(verbatim: row.earnText).textStyle(.g12Item13).foregroundStyle(.g12Green)
            }
            .padding(.horizontal, Spacing.s3_5).padding(.vertical, Spacing.s3)
            .background(Color.brandBackground, in: RoundedRectangle(cornerRadius: Radius.sm))
            .overlay(RoundedRectangle(cornerRadius: Radius.sm).strokeBorder(Color.g12CardBorder, lineWidth: BorderWidth.hairline))
        }
        .g12Card()
    }
}

private extension ServicePriceRow.Service {
    var style: (icon: String, tint: Color, title: LocalizedStringKey) {
        switch self {
        case .chat: ("IconG12ChatBold", .brandSaffron, "e.g12.prices.chat")
        case .audio: ("IconG12CallBold", .g12Green, "e.g12.prices.audio")
        case .video: ("IconG12VideoBold", .brandIndigo, "e.g12.prices.video")
        }
    }
}

extension ServicePriceRow {
    static let samples: [ServicePriceRow] = [
        .init(service: .chat, allowedText: "Allowed: ₹15 to ₹40 / min", priceText: "₹20.00", earnText: "₹16.00 / min"),
        .init(service: .audio, allowedText: "Allowed: ₹20 to ₹60 / min", priceText: "₹25.00", earnText: "₹20.00 / min"),
        .init(service: .video, allowedText: "Allowed: ₹30 to ₹100 / min", priceText: "₹40.00", earnText: "₹32.00 / min"),
    ]
}

#Preview("E-14 Prices") { ExpertPricesView(rows: ServicePriceRow.samples) }
