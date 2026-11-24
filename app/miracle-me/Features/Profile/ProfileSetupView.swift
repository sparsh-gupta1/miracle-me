import SwiftUI

/// C-01 — name, gender, date of birth.
struct ProfileSetupView: View {
    @Bindable var draft: ProfileDraft
    let onContinue: () -> Void
    let onSkip: () -> Void

    private var canContinue: Bool { !draft.name.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                StepHeader(step: "profile.step", skip: "common.skipForNow", onSkip: onSkip)
                Text("profile.title").textStyle(.screenHeading).foregroundStyle(.brandIndigo).padding(.bottom, Spacing.s1)
                Text("profile.subtitle").textStyle(.captionRelaxed).foregroundStyle(.textMuted).padding(.bottom, Spacing.s6)
                PhotoPlaceholder().frame(maxWidth: .infinity).padding(.bottom, Spacing.s6)
                VStack(alignment: .leading, spacing: Spacing.s4) {
                    LabeledField(label: "profile.name") {
                        AppTextField(text: $draft.name)
                            .textContentType(.name)
                    }
                    LabeledField(label: "profile.gender") {
                        ChoiceGroup(
                            options: Gender.allCases.map { .init(value: $0, title: $0.title) },
                            selection: $draft.gender, size: .field)
                    }
                    LabeledField(label: "profile.dob", suffix: "profile.optional") {
                        DateField(date: $draft.dateOfBirth, format: "dd / MM / yyyy", placeholder: "profile.dobPlaceholder", style: .fieldMedium)
                        Text("profile.ageNote").textStyle(.microMedium).foregroundStyle(.textMuted)
                            .padding(.top, Spacing.s0_5)
                    }
                }
            }
            .padding(Spacing.s6)
        }
        .scrollBounceBehavior(.basedOnSize)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            PrimaryButton(title: "action.continue", radius: Radius.md, textStyle: .compactButton, action: onContinue)
                .disabled(!canContinue)
                .padding(.horizontal, Spacing.s6)
                .padding(.top, Spacing.s4)
                .padding(.bottom, Spacing.s6)
                .background(Color.brandBackground)
        }
        .background(Color.brandBackground.ignoresSafeArea())
    }
}

extension Gender {
    var title: LocalizedStringKey {
        switch self {
        case .male: "gender.male"
        case .female: "gender.female"
        case .other: "gender.other"
        }
    }
}

/// "Step n of m" with an underlined skip link.
struct StepHeader: View {
    let step: LocalizedStringKey
    let skip: LocalizedStringKey
    let onSkip: () -> Void

    var body: some View {
        HStack {
            Text(step).textStyle(.xsSemibold).foregroundStyle(.textMuted)
            Spacer(minLength: 0)
            Button(action: onSkip) {
                Text(skip).textStyle(.xsSemibold).underline().foregroundStyle(.brandIndigo)
            }
        }
        .padding(.bottom, Spacing.s6)
    }
}

private struct PhotoPlaceholder: View {
    var body: some View {
        VStack(spacing: Spacing.s1) {
            Icon(.camera2, size: 24).foregroundStyle(.brandIndigo)
            Text("profile.photo").textStyle(.nanoSemibold).foregroundStyle(.textMuted)
                .lineLimit(1).minimumScaleFactor(0.8).padding(.horizontal, Spacing.s2)
        }
        .frame(width: 96, height: 96)
        .background(Color.surfaceLavender, in: Circle())
        .overlay(Circle().strokeBorder(Color.borderMuted, style: StrokeStyle(lineWidth: BorderWidth.strong, dash: [6, 6])))
        .accessibilityElement(children: .combine)
    }
}

#Preview("Profile") {
    let draft = ProfileDraft()
    draft.name = "Rahul Sharma"
    draft.gender = .male
    draft.dateOfBirth = Calendar.current.date(from: DateComponents(year: 1996, month: 8, day: 14))
    return ProfileSetupView(draft: draft, onContinue: {}, onSkip: {})
}
