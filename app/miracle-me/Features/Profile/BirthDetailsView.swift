import SwiftUI

/// C-02 — birth date, time, place.
struct BirthDetailsView: View {
    @Bindable var draft: ProfileDraft
    let onContinue: () -> Void
    let onSkip: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                StepHeader(step: "birth.step", skip: "action.skip", onSkip: onSkip)
                Text("birth.title").textStyle(.screenHeading).foregroundStyle(.brandIndigo).padding(.bottom, Spacing.s1)
                Text("birth.subtitle").textStyle(.captionRelaxed).foregroundStyle(.textMuted).padding(.bottom, Spacing.s5)
                VStack(alignment: .leading, spacing: Spacing.s3_5) {
                    LabeledField(label: "profile.dob", spacing: Spacing.s1) {
                        DateField(date: $draft.birthDate, format: "d MMMM yyyy", height: 40, horizontalPadding: Spacing.s3, style: .xsSemibold)
                    }
                    LabeledField(label: "birth.time", spacing: Spacing.s1) {
                        DateField(date: $draft.birthTime, components: .hourAndMinute, format: "hh:mm a", height: 40, horizontalPadding: Spacing.s3, style: .xsSemibold)
                    }
                    unknownTimeBox
                    LabeledField(label: "birth.place", spacing: Spacing.s1) {
                        FieldBox(height: 40, horizontalPadding: 0) {
                            Icon(.mapPin, size: 16).foregroundStyle(.brandIndigo).padding(.horizontal, Spacing.s3)
                            TextField("", text: $draft.birthPlace)
                                .textStyle(.xsSemibold).foregroundStyle(.brandIndigo)
                        }
                    }
                    Toggle(isOn: $draft.sharesWithAstrologers) {
                        VStack(alignment: .leading, spacing: Spacing.s0_5) {
                            Text("birth.share.title").textStyle(.xsSemibold).foregroundStyle(.brandIndigo)
                            Text("birth.share.body").textStyle(.microMedium).foregroundStyle(.textMuted)
                        }
                    }
                    .toggleStyle(.checkbox(alignment: .top))
                    .padding(.top, Spacing.s1)
                }
            }
            .padding(Spacing.s6)
        }
        .scrollBounceBehavior(.basedOnSize)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: Spacing.s2) {
                PrimaryButton(title: "common.saveContinue", radius: Radius.md, height: 44, textStyle: .xsBold, action: onContinue)
                TextButton(title: "common.skipForNow", style: .xsSemibold, color: .textMuted, action: onSkip)
                    .frame(height: 36)
            }
            .padding(.horizontal, Spacing.s6)
            .padding(.top, Spacing.s4)
            .padding(.bottom, Spacing.s6)
            .background(Color.brandBackground)
        }
        .background(Color.brandBackground.ignoresSafeArea())
    }

    private var unknownTimeBox: some View {
        VStack(alignment: .leading, spacing: Spacing.s2_5) {
            Toggle(isOn: $draft.doesNotKnowBirthTime) {
                Text("birth.unknownTime").textStyle(.xsSemibold).foregroundStyle(.brandIndigo)
            }
            .toggleStyle(.checkbox)
            Menu {
                Picker("", selection: $draft.approximatePeriod) {
                    ForEach(BirthTimePeriod.allCases, id: \.self) { Text($0.title).tag($0) }
                }
            } label: {
                FieldBox(height: 36, horizontalPadding: Spacing.s2, radius: Radius.xs) {
                    Text(draft.approximatePeriod == .morning ? "birth.period.morning" : draft.approximatePeriod.title)
                        .textStyle(.xsMedium).foregroundStyle(.brandIndigo).lineLimit(1)
                    Spacer(minLength: Spacing.s2)
                    Icon(.chevronDown, size: 14).foregroundStyle(.textMuted)
                }
            }
        }
        .padding(Spacing.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.surfaceLavender.opacity(0.6), in: RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.borderLavender, lineWidth: BorderWidth.hairline))
    }
}

extension BirthTimePeriod {
    var title: LocalizedStringKey {
        switch self {
        case .morning: "birth.period.morning"
        case .afternoon: "birth.period.afternoon"
        case .evening: "birth.period.evening"
        case .night: "birth.period.night"
        }
    }
}

#Preview("Birth details") {
    let draft = ProfileDraft()
    draft.birthDate = Calendar.current.date(from: DateComponents(year: 1996, month: 8, day: 14))
    draft.birthTime = Calendar.current.date(from: DateComponents(hour: 6, minute: 45))
    draft.doesNotKnowBirthTime = true
    draft.birthPlace = "Jaipur, Rajasthan, India"
    return BirthDetailsView(draft: draft, onContinue: {}, onSkip: {})
}
