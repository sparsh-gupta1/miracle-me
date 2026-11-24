import SwiftUI

struct ExpertSessionRecapSample {
    var summary = "Audio Call with Rahul Sharma • 14 minutes"
    var gross = "₹280.00"
    var fee = "-₹56.00"
    var reimbursed = "₹0.00 (Platform funded)"
    var net = "₹224.00"
    var rating = "5.0"
    var review = "\"Very accurate guidance! Acharya ji provided clear answers for my career transition.\""
    var grossLabel = "Gross Value (14m × ₹20)"
    var feeLabel = "Platform Fee (20%)"
    var notes = "Discussed career planetary transition; follow-up remedy advised. Chart flagged for Nov review."
}

/// E-04b / E-05 session ended and recap.
struct ExpertSessionRecapView: View {
    var sample = ExpertSessionRecapSample()
    var onDismiss: () -> Void = {}
    var onGoHome: () -> Void = {}
    var onViewEarnings: () -> Void = {}

    var body: some View {
        VStack(spacing: 0) {
            G10AppBar {
                HStack {
                    Text("e.g10.e05.title").textStyle(.g10Title18Bold).foregroundStyle(Color.g10Ink)
                    Spacer(minLength: 0)
                    Button(action: onDismiss) {
                        G10Icon("IconClose", size: 20).foregroundStyle(Color.g10OnSurfaceVariant)
                            .frame(width: 32, height: 32)
                    }
                    .buttonStyle(.plain).accessibilityLabel("Dismiss")
                }
            }
            ScrollView {
                VStack(spacing: Spacing.s3_5) {
                    banner
                    payoutCard
                    ratingCard
                    notesCard
                    VStack(spacing: Spacing.s2) {
                        PrimaryButton(title: "e.g10.e05.home", action: onGoHome)
                        Button(action: onViewEarnings) {
                            Text("e.g10.e05.earnings").textStyle(.g10Text14Bold).foregroundStyle(Color.brandIndigo)
                                .frame(maxWidth: .infinity).frame(height: 44)
                                .overlay(RoundedRectangle(cornerRadius: Radius.lg).strokeBorder(Color.brandIndigo, lineWidth: BorderWidth.hairline))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.top, Spacing.s1)
                }
                .padding(.horizontal, Spacing.s4).padding(.top, Spacing.s4).padding(.bottom, Spacing.s6)
            }
            .scrollIndicators(.hidden)
        }
        .background(Color.brandBackground.ignoresSafeArea())
    }

    private var banner: some View {
        VStack(spacing: 0) {
            G10Icon("IconCheck", size: 26).foregroundStyle(.white)
                .frame(width: 48, height: 48).background(Color.statusOnlineDot, in: Circle())
                .shadow(color: .black.opacity(0.05), radius: 1, y: 1)
                .padding(.bottom, Spacing.s2)
            Text("e.g10.e05.done").textStyle(.g10Title18Bold).foregroundStyle(Color.g10Ink)
            Text(verbatim: sample.summary).textStyle(.g10Caption).foregroundStyle(Color.g10OnSurfaceVariant)
                .padding(.top, Spacing.s0_5)
        }
        .frame(maxWidth: .infinity)
        .padding(Spacing.s4)
        .background(LinearGradient(colors: [.g10GreenPale, .white], startPoint: .top, endPoint: .bottom),
                    in: RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl).strokeBorder(Color.g10GreenOutline, lineWidth: BorderWidth.hairline))
        .elevationSm()
    }

    private var payoutCard: some View {
        VStack(spacing: Spacing.s2_5) {
            payoutRow(Text(verbatim: sample.grossLabel), sample.gross, color: .g10OnSurface)
            payoutRow(Text(verbatim: sample.feeLabel), sample.fee, color: .statusCritical)
            payoutRow(Text("e.g10.e05.reimbursed"), sample.reimbursed, color: .statusOnlineDot)
            HStack {
                Text("e.g10.e05.net").textStyle(.g10SubheadBold).foregroundStyle(Color.g10Ink)
                Spacer(minLength: 0)
                Text(verbatim: sample.net).textStyle(.g10Title20Bold).foregroundStyle(Color.statusOnlineDot)
            }
            .padding(.top, Spacing.s1)
        }
        .g10Card()
    }

    private func payoutRow(_ label: Text, _ value: String, color: Color) -> some View {
        HStack {
            label.textStyle(.g10Caption).foregroundStyle(Color.g10OnSurfaceVariant)
            Spacer(minLength: Spacing.s2)
            Text(verbatim: value).textStyle(.g10Text14Semibold).foregroundStyle(color)
        }
        .padding(.bottom, Spacing.s2)
        .g10Rule(.bottom, color: .g10Divider)
    }

    private var ratingCard: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("e.g10.e05.rating").textStyle(.g10Text11Caps).textCase(.uppercase).foregroundStyle(Color.g10OnSurfaceVariant)
            HStack(spacing: Spacing.s1_5) {
                ForEach(0..<5, id: \.self) { _ in
                    G10Icon("IconG10StarFilled", size: 20).foregroundStyle(Color.brandSaffron)
                }
                Text(verbatim: sample.rating).textStyle(.g10Text14Bold).foregroundStyle(Color.g10Ink).padding(.leading, Spacing.s1)
            }
            Text(verbatim: sample.review).textStyle(.g10Italic13).italic().foregroundStyle(Color.g10OnSurface)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Spacing.s2_5)
                .background(Color.brandBackground, in: RoundedRectangle(cornerRadius: Radius.md))
                .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .g10Card()
    }

    private var notesCard: some View {
        VStack(alignment: .leading, spacing: Spacing.s1_5) {
            HStack(spacing: Spacing.s1_5) {
                G10Icon("IconG10BookmarkCheck", size: 16)
                Text("e.g10.e05.notes").textStyle(.g10Body13Bold)
            }
            .foregroundStyle(Color.brandIndigo)
            Text(verbatim: sample.notes).textStyle(.g10CaptionRelaxed).foregroundStyle(Color.g10OnSurfaceVariant)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .g10Card(padding: Spacing.s3_5)
    }
}
