import SwiftUI

struct ExpertDocuments: Equatable {
    var panNumber: String
    var panName: String
    var panFile: String
    var idSummary: String
    var certificateTitle: String
    var certificateIssuer: String
    var certificateSubmitted: String
    var bankSummary: String
}

extension ExpertDocuments {
    static let sample = ExpertDocuments(
        panNumber: "ABCDE1234F", panName: "KESHAV SHARMA", panFile: "pan_card_front.jpg",
        idSummary: "Aadhaar Card (•••• •••• 8821)",
        certificateTitle: "Acharya Degree in Jyotish Shastra",
        certificateIssuer: "Issuing: All India Federation of Astrologers Societies",
        certificateSubmitted: "Submitted on 14 Oct 2024",
        bankSummary: "State Bank of India (•••• 4109)")
}

/// E-18 — documents & KYC.
struct ExpertDocumentsView: View {
    let documents: ExpertDocuments
    var onBack: () -> Void = {}
    var onViewPAN: () -> Void = {}
    var onReupload: () -> Void = {}
    var onComplianceDesk: () -> Void = {}
    var onDownloadSlip: () -> Void = {}

    var body: some View {
        VStack(spacing: 0) {
            G13AppBar(title: "e.g13.docs.title", onBack: onBack)
            ScrollView {
                VStack(spacing: Spacing.s3_5) {
                    privacyNote
                    panCard
                    idCard
                    certificateCard
                    bankCard
                    complianceNote
                    Button(action: onDownloadSlip) {
                        HStack(spacing: Spacing.s2) {
                            Icon(.download, size: 18)
                            Text("e.g13.docs.download").textStyle(.g13Subhead13Semibold)
                        }
                        .foregroundStyle(Color.g13Primary)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .background(Color.g13SurfaceContainer, in: RoundedRectangle(cornerRadius: Radius.md))
                        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.g13Border, lineWidth: BorderWidth.hairline))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, Spacing.s1)
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.top, Spacing.s1)
                .padding(.bottom, Spacing.s6)
            }
            .scrollIndicators(.hidden)
        }
        .background(Color.brandBackground.ignoresSafeArea())
    }

    // MARK: Pieces

    private var privacyNote: some View {
        HStack(alignment: .top, spacing: Spacing.s2_5) {
            G13Icon("IconG13ShieldCheck", size: 16).foregroundStyle(Color.g13OnPrimaryContainer)
                .frame(width: 28, height: 28)
                .background(Color.brandIndigo, in: RoundedRectangle(cornerRadius: Radius.xs))
            Text("e.g13.docs.privacy").textStyle(.g13CaptionRelaxedMedium).foregroundStyle(Color.g13OnSurface)
        }
        .padding(Spacing.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .g13Card(fill: .g13SurfaceContainer, shadow: false)
    }

    private func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) { content() }
            .frame(maxWidth: .infinity, alignment: .leading)
            .g13Card(padding: Spacing.s3_5)
    }

    private func header<I: View>(@ViewBuilder icon: () -> I, _ title: LocalizedStringKey, status: some View) -> some View {
        HStack {
            HStack(spacing: Spacing.s2) {
                icon().foregroundStyle(Color.g13Primary)
                Text(title).textStyle(.g13SubheadBold).foregroundStyle(Color.g13OnSurface)
            }
            Spacer(minLength: Spacing.s2)
            status
        }
    }

    private var verified: some View { G13StatusPill(tone: .verified, title: "e.g13.docs.verified", icon: .check) }

    private var panCard: some View {
        card {
            header(icon: { G13Icon("IconG13IdCard", size: 20) }, "e.g13.docs.pan", status: verified)
            Text("e.g13.docs.panHint").textStyle(.g13Caption11).foregroundStyle(Color.g13Outline)
            VStack(spacing: Spacing.s1) {
                HStack {
                    Text("e.g13.docs.panNumber").foregroundStyle(Color.g13OnSurfaceVariant)
                    Spacer(minLength: 0)
                    Text(verbatim: documents.panNumber).textStyle(.g13CaptionMono).foregroundStyle(Color.g13OnSurface)
                }
                HStack {
                    Text("e.g13.docs.panName").foregroundStyle(Color.g13OnSurfaceVariant)
                    Spacer(minLength: 0)
                    Text(verbatim: documents.panName).textStyle(.g13CaptionSemibold).foregroundStyle(Color.g13OnSurface)
                }
            }
            .textStyle(.g13Caption)
            .padding(Spacing.s2_5)
            .background(Color.g13SurfaceContainerLow, in: RoundedRectangle(cornerRadius: Radius.xs))
            HStack {
                HStack(spacing: Spacing.s1) {
                    G13Icon("IconG13Paperclip", size: 14)
                    Text(verbatim: documents.panFile).textStyle(.g13Caption)
                }
                .foregroundStyle(Color.g13OnSurfaceVariant)
                Spacer(minLength: 0)
                linkButton("e.g13.docs.view", action: onViewPAN)
            }
            .padding(.top, Spacing.s1)
        }
    }

    private var idCard: some View {
        card {
            header(icon: { G13Icon("IconG13Fingerprint", size: 20) }, "e.g13.docs.govId", status: verified)
            Text(verbatim: documents.idSummary).textStyle(.g13Body13Medium).foregroundStyle(Color.g13OnSurface)
            Text("e.g13.docs.govIdHint").textStyle(.g13Caption11).foregroundStyle(Color.g13OnSurfaceVariant)
        }
    }

    private var certificateCard: some View {
        card {
            header(icon: { G13Icon("IconG13GraduationCap", size: 20) }, "e.g13.docs.certificate",
                   status: G13StatusPill(tone: .review, title: "e.g13.docs.underReview", icon: .clock))
            VStack(alignment: .leading, spacing: Spacing.s0_5) {
                Text(verbatim: documents.certificateTitle).textStyle(.g13Subhead13Bold).foregroundStyle(Color.g13OnSurface)
                Text(verbatim: documents.certificateIssuer).textStyle(.g13Caption11).foregroundStyle(Color.g13OnSurfaceVariant)
            }
            HStack {
                Text(verbatim: documents.certificateSubmitted).textStyle(.g13Caption11).foregroundStyle(Color.g13Outline)
                Spacer(minLength: 0)
                linkButton("e.g13.docs.reupload", action: onReupload)
            }
            .padding(.top, Spacing.s1)
        }
    }

    private var bankCard: some View {
        card {
            header(icon: { G13Icon("IconG13Landmark", size: 20) }, "e.g13.docs.bank",
                   status: G13StatusPill(tone: .verified, title: "e.g13.docs.pennyVerified", icon: .check))
            HStack {
                Text(verbatim: documents.bankSummary).textStyle(.g13Caption).foregroundStyle(Color.g13OnSurfaceVariant)
                Spacer(minLength: Spacing.s2)
                Text("e.g13.docs.pennyMatch").textStyle(.g13CaptionSemibold).foregroundStyle(Color.g13TertiaryFixedDim)
                    .padding(.horizontal, Spacing.s2).padding(.vertical, Spacing.s0_5)
                    .background(Color.g13TertiaryContainer, in: RoundedRectangle(cornerRadius: 4))
            }
        }
    }

    private var complianceNote: some View {
        var text = AttributedString(String(localized: "e.g13.docs.complianceLead") + " ")
        var link = AttributedString(String(localized: "e.g13.docs.complianceLink"))
        link.foregroundColor = Color.g13Secondary
        link.font = TextStyle.g13Caption11Semibold.font(for: .latin)
        text.append(link)
        text.append(AttributedString("."))
        return Button(action: onComplianceDesk) {
            Text(text).textStyle(.g13Caption11).foregroundStyle(Color.g13OnSurfaceVariant)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Spacing.s2).padding(.vertical, Spacing.s1)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private func linkButton(_ title: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).textStyle(.g13CaptionSemibold).foregroundStyle(Color.g13Secondary)
        }
        .buttonStyle(.plain)
    }
}

#Preview("E-18 Documents") { ExpertDocumentsView(documents: .sample) }
