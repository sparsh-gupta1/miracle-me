import SwiftUI

/// One entry in the consultation record stream.
enum ExpertRecordItem: Identifiable {
    case session(id: String, summary: String, net: String)
    case customer(id: String, text: String, time: String)
    case expert(id: String, text: String, time: String, delivered: Bool)
    case remedy(id: String, text: String, status: String)

    var id: String {
        switch self {
        case .session(let id, _, _), .customer(let id, _, _), .expert(let id, _, _, _), .remedy(let id, _, _): id
        }
    }
}

/// Customer header facts shown in the E-07 bar and pinned strip.
struct ExpertRecordCustomer {
    let initials: String
    let name: String
    /// "28y, M • Jaipur • 2 Consultations"
    let subtitle: String
    let dateOfBirth: String
    let lagna: String
    let notesCount: Int
}

/// E-07 — consultation record & chat with the customer.
struct ExpertConsultationRecordView: View {
    let customer: ExpertRecordCustomer
    let items: [ExpertRecordItem]
    @Binding var draft: String
    var onBack: () -> Void = {}
    var onChart: () -> Void = {}
    var onNotes: () -> Void = {}
    var onSend: () -> Void = {}

    var body: some View {
        VStack(spacing: 0) {
            topBar
            pinned
            ScrollView {
                VStack(spacing: Spacing.s3) {
                    ForEach(items) { item in row(item) }
                }
                .padding(Spacing.s3)
            }
            .scrollIndicators(.hidden)
            .background(Color.brandBackground)
            composer
        }
        .background(Color.brandBackground.ignoresSafeArea())
    }

    // MARK: Bars

    private var topBar: some View {
        G11Bar(edge: .top) {
            HStack {
                HStack(spacing: Spacing.s2_5) {
                    Button(action: onBack) {
                        G11Icon("ChevronLeft", size: 20).foregroundStyle(Color.g11Slate600).padding(Spacing.s1)
                    }
                    .accessibilityLabel("Back")
                    G11Avatar(initials: customer.initials, size: 36)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(verbatim: customer.name).textStyle(.g11SmTight).foregroundStyle(Color.g11Slate900)
                        Text(verbatim: customer.subtitle).textStyle(.g11Nano).foregroundStyle(Color.g11Slate500).lineLimit(1)
                    }
                }
                Spacer(minLength: Spacing.s2)
                Button(action: onChart) {
                    HStack(spacing: Spacing.s1) {
                        G11Icon("Document", size: 14)
                        Text("e.g11.record.chart")
                    }
                    .textStyle(.xsBold).foregroundStyle(.brandSaffron)
                    .padding(.horizontal, Spacing.s2).padding(.vertical, Spacing.s1)
                    .background(Color.brandSaffron.opacity(0.1), in: RoundedRectangle(cornerRadius: 4))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Spacing.s3).padding(.top, Spacing.s3).padding(.bottom, Spacing.s2_5)
        }
    }

    private var pinned: some View {
        G11Bar(edge: .bottom) {
            HStack {
                HStack(spacing: Spacing.s2) {
                    Text("e.g11.record.dob").foregroundStyle(Color.g11Slate400)
                    Text(verbatim: customer.dateOfBirth).fontWeight(.medium).foregroundStyle(Color.g11Slate700)
                    Text(verbatim: "|").foregroundStyle(Color.g11Slate300)
                    Text(verbatim: "Lagna: \(customer.lagna)").fontWeight(.medium).foregroundStyle(Color.g11Slate700)
                }
                .textStyle(.xs).lineLimit(1)
                Spacer(minLength: Spacing.s2)
                Button(action: onNotes) {
                    Text(verbatim: "Notes (\(customer.notesCount))").textStyle(.microBold).foregroundStyle(.brandSaffron)
                }
            }
            .padding(.horizontal, Spacing.s3).padding(.vertical, Spacing.s2)
        }
    }

    private var composer: some View {
        VStack(spacing: Spacing.s2) {
            ScrollView(.horizontal) {
                HStack(spacing: Spacing.s1_5) {
                    action("Pencil", "e.g11.record.notes", tint: .brandSaffron)
                    action("Plus", "e.g11.record.remedy", tint: .brandIndigo)
                    action("Paperclip", "e.g11.record.attach", tint: .g11Slate500)
                }
            }
            .scrollIndicators(.hidden)
            HStack(spacing: Spacing.s2) {
                TextField("", text: $draft, prompt: Text(verbatim: "Type reply to \(customer.name.split(separator: " ").first ?? "")...").foregroundColor(.g11Slate400))
                    .textStyle(.xs).foregroundStyle(Color.g11Slate900)
                    .padding(.horizontal, Spacing.s3).padding(.vertical, Spacing.s2)
                    .background(Color.brandBackground, in: RoundedRectangle(cornerRadius: Radius.md))
                    .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
                Button(action: onSend) {
                    G11Icon("Send", size: 16).foregroundStyle(.white).rotationEffect(.degrees(90))
                        .frame(width: 32, height: 32)
                        .background(Color.brandSaffron, in: RoundedRectangle(cornerRadius: Radius.md))
                }
                .accessibilityLabel("Send")
            }
        }
        .padding(Spacing.s2_5)
        .frame(maxWidth: .infinity)
        .background(Color.surface.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Rectangle().fill(Color.brandBorder).frame(height: BorderWidth.hairline) }
    }

    private func action(_ icon: String, _ title: LocalizedStringKey, tint: Color) -> some View {
        HStack(spacing: Spacing.s1) {
            G11Icon(icon, size: 14).foregroundStyle(tint)
            Text(title)
        }
        .textStyle(.microMedium).foregroundStyle(Color.g11Slate700).fixedSize()
        .padding(.horizontal, Spacing.s2_5).padding(.vertical, Spacing.s1)
        .background(Color.g11Slate100, in: Capsule())
    }

    // MARK: Stream

    @ViewBuilder private func row(_ item: ExpertRecordItem) -> some View {
        switch item {
        case .session(_, let summary, let net):
            HStack(spacing: Spacing.s1_5) {
                Text(verbatim: summary)
                Text(verbatim: "•")
                Text(verbatim: net).fontWeight(.semibold).foregroundStyle(Color.g11Emerald700)
            }
            .textStyle(.micro).foregroundStyle(Color.g11Slate600)
            .padding(.horizontal, Spacing.s3).padding(.vertical, Spacing.s1)
            .background(Color.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
            .shadow(color: .black.opacity(0.05), radius: 1, y: 1)
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.s2)
        case .customer(_, let text, let time):
            FractionalWidth(0.85) {
                VStack(alignment: .leading, spacing: Spacing.s1) {
                    Text(verbatim: text).textStyle(.g11XsRelaxed).foregroundStyle(Color.g11Slate800)
                        .padding(Spacing.s3)
                        .background(Color.surface, in: bubble(tail: .topLeading))
                        .overlay(bubble(tail: .topLeading).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
                        .shadow(color: .black.opacity(0.05), radius: 1, y: 1)
                    Text(verbatim: time).textStyle(.g11Nano).foregroundStyle(Color.g11Slate400).padding(.leading, Spacing.s1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        case .expert(_, let text, let time, let delivered):
            FractionalWidth(0.85) {
                VStack(alignment: .trailing, spacing: Spacing.s1) {
                    Text(verbatim: text).textStyle(.g11XsRelaxed).foregroundStyle(.white)
                        .padding(Spacing.s3)
                        .background(Color.brandIndigo, in: bubble(tail: .topTrailing))
                        .shadow(color: .black.opacity(0.05), radius: 1, y: 1)
                    HStack(spacing: Spacing.s1) {
                        Text(verbatim: time)
                        if delivered { Icon(.check, size: 12).foregroundStyle(Color.g11Emerald400) }
                    }
                    .textStyle(.g11Nano).foregroundStyle(Color.g11Slate400).padding(.trailing, Spacing.s1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        case .remedy(_, let text, let status):
            FractionalWidth(0.9) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: Spacing.s2) {
                        G11Icon("CheckCircle", size: 16).foregroundStyle(.brandSaffron)
                        Text("e.g11.record.remedyTitle")
                    }
                    .textStyle(.xsBold).foregroundStyle(.brandIndigo).padding(.bottom, Spacing.s1)
                    Text(verbatim: text).textStyle(.g11MicroSnug).foregroundStyle(Color.g11Slate600)
                    HStack {
                        Text("e.g11.record.remedyShared").foregroundStyle(Color.g11Slate400)
                        Spacer(minLength: 0)
                        Text(verbatim: status).fontWeight(.semibold).foregroundStyle(Color.brandSaffron)
                    }
                    .textStyle(.g11Nano)
                    .padding(.top, Spacing.s1_5)
                    .overlay(alignment: .top) { Rectangle().fill(Color.g11Slate100).frame(height: BorderWidth.hairline) }
                    .padding(.top, Spacing.s2)
                }
                .padding(Spacing.s2_5)
                .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.md))
                .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
                .shadow(color: .black.opacity(0.05), radius: 1, y: 1)
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }

    /// `rounded-2xl` with a 2-pt corner on the speaker's side.
    private func bubble(tail: Alignment) -> UnevenRoundedRectangle {
        UnevenRoundedRectangle(topLeadingRadius: tail == .topLeading ? 2 : Radius.xl,
                               bottomLeadingRadius: Radius.xl, bottomTrailingRadius: Radius.xl,
                               topTrailingRadius: tail == .topTrailing ? 2 : Radius.xl)
    }
}

/// Lets a child take its natural width up to a fraction of the proposed width (`max-w-[85%]`).
private struct FractionalWidth: Layout {
    let fraction: CGFloat
    init(_ fraction: CGFloat) { self.fraction = fraction }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let child = subviews.first else { return .zero }
        let limit = (proposal.width ?? .infinity) * fraction
        return child.sizeThatFits(.init(width: limit, height: proposal.height))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let child = subviews.first else { return }
        let limit = bounds.width * fraction
        let size = child.sizeThatFits(.init(width: limit, height: nil))
        child.place(at: bounds.origin, proposal: .init(width: size.width, height: size.height))
    }
}

extension ExpertRecordCustomer {
    static let sample = ExpertRecordCustomer(initials: "RS", name: "Rahul Sharma", subtitle: "28y, M • Jaipur • 2 Consultations",
                                             dateOfBirth: "14 Aug 1996, 06:45 AM", lagna: "Scorpio", notesCount: 1)
}

extension ExpertRecordItem {
    static let samples: [ExpertRecordItem] = [
        .session(id: "s", summary: "Audio Call • 14 Oct • 14 mins", net: "+₹224 Net"),
        .customer(id: "1", text: "Pranam Acharya ji. Regarding my job switch in IT, is November favorable for giving interviews?", time: "11:31 AM"),
        .expert(id: "2", text: "Namaste Rahul. As discussed, Jupiter's transit through your 9th house brings stability after 18 Nov. Until then, refrain from resigning impulsively.", time: "11:33 AM", delivered: true),
        .remedy(id: "3", text: "Chant Guru Gayatri Mantra 108 times on Thursday mornings facing North-East.", status: "Delivered"),
        .customer(id: "4", text: "Thank you ji! Can you also check if any gemstone is needed for Saturn?", time: "11:36 AM"),
    ]
}

#Preview("E-07 Record") {
    ExpertConsultationRecordView(customer: .sample, items: ExpertRecordItem.samples, draft: .constant(""))
}
