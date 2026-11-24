import SwiftUI

/// Values shown on E-16. Plain data so the backend can fill it later.
struct ExpertProfileEdit: Equatable {
    var initials: String
    var displayName: String
    var headline: String
    var experienceText: String
    var ratingText: String
    var legalName: String
    var specialisations: [String]
    var languages: [String]
    var bio: String
    var education: String
    var bioLimit = 500
}

extension ExpertProfileEdit {
    static let sample = ExpertProfileEdit(
        initials: "AK", displayName: "Acharya Keshav", headline: "Vedic Astrologer & Vastu Consultant",
        experienceText: "12+ Years Experience", ratingText: "4.92 (48 Consultations)",
        legalName: "Acharya Keshav",
        specialisations: ["Vedic Astrology", "Kundli Matching", "Career Guidance", "Vastu Shastra"],
        languages: ["Hindi", "English", "Sanskrit"],
        bio: "Specializing in planetary transits, dasha analysis, and career trajectory forecasting. Providing pragmatic remedies rooted in classic Vedic texts for over a decade.",
        education: "Shri Lal Bahadur Shastri National Sanskrit University")
}

/// E-16 — expert profile & edit. The bottom navigation is supplied by the tab shell through `bottomBar`.
struct ExpertProfileEditView<BottomBar: View>: View {
    @State private var draft: ExpertProfileEdit
    var onBack: () -> Void = {}
    var onPreview: () -> Void = {}
    var onChangePhoto: () -> Void = {}
    var onAddTag: () -> Void = {}
    var onSubmit: (ExpertProfileEdit) -> Void = { _ in }
    @ViewBuilder var bottomBar: BottomBar

    init(profile: ExpertProfileEdit, onBack: @escaping () -> Void = {}, onPreview: @escaping () -> Void = {},
         onChangePhoto: @escaping () -> Void = {}, onAddTag: @escaping () -> Void = {},
         onSubmit: @escaping (ExpertProfileEdit) -> Void = { _ in }, @ViewBuilder bottomBar: () -> BottomBar) {
        _draft = State(initialValue: profile)
        self.onBack = onBack
        self.onPreview = onPreview
        self.onChangePhoto = onChangePhoto
        self.onAddTag = onAddTag
        self.onSubmit = onSubmit
        self.bottomBar = bottomBar()
    }

    var body: some View {
        VStack(spacing: 0) {
            G13AppBar(title: "e.g13.profile.title", onBack: onBack) {
                Button(action: onPreview) {
                    Text("e.g13.profile.preview").textStyle(.g13CaptionSemibold).foregroundStyle(Color.g13Primary)
                        .padding(.horizontal, Spacing.s3).padding(.vertical, Spacing.s1)
                }
            }
            ScrollView {
                VStack(spacing: Spacing.s4) {
                    identityCard
                    legalNameField
                    specialisationsField
                    languagesField
                    bioField
                    educationField
                    Button { onSubmit(draft) } label: {
                        HStack(spacing: Spacing.s2) {
                            G13Icon("IconG13Send", size: 18)
                            Text("e.g13.profile.submit").textStyle(.g13Subhead)
                        }
                    }
                    .buttonStyle(G13SaffronButtonStyle())
                    .padding(.top, Spacing.s2)
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.top, Spacing.s2)
                .padding(.bottom, 80)
            }
            .scrollIndicators(.hidden)
            bottomBar
        }
        .background(Color.brandBackground.ignoresSafeArea())
    }

    // MARK: Pieces

    private var identityCard: some View {
        VStack(spacing: 0) {
            avatar.padding(.bottom, Spacing.s2)
            Text(verbatim: draft.displayName).textStyle(.g13SubheadBold).foregroundStyle(Color.g13OnSurface)
            Text(verbatim: draft.headline).textStyle(.g13CaptionMedium).foregroundStyle(Color.g13OnSurfaceVariant)
            HStack(spacing: Spacing.s2) {
                HStack(spacing: Spacing.s1) {
                    G13Icon("IconG13Briefcase", size: 14).foregroundStyle(Color.g13Secondary)
                    Text(verbatim: draft.experienceText).textStyle(.g13CaptionMedium).foregroundStyle(Color.g13OnSurface)
                }
                .padding(.horizontal, Spacing.s2_5).padding(.vertical, Spacing.s0_5)
                .background(Color.g13SurfaceContainer, in: Capsule())
                HStack(spacing: Spacing.s1) {
                    G13Icon("IconG13StarFilled", size: 13)
                    Text(verbatim: draft.ratingText).textStyle(.g13CaptionSemibold)
                }
                .foregroundStyle(Color.g13Secondary)
                .padding(.horizontal, Spacing.s2_5).padding(.vertical, Spacing.s0_5)
                .background(Color.g13SecondaryFixed, in: Capsule())
            }
            .padding(.top, Spacing.s2)
            reviewNotice.padding(.top, Spacing.s3)
        }
        .frame(maxWidth: .infinity)
        .g13Card(padding: Spacing.s4)
    }

    private var avatar: some View {
        Text(verbatim: draft.initials)
            .textStyle(.g13Title).foregroundStyle(Color.g13OnPrimaryContainer)
            .frame(width: 80, height: 80)
            .background(Color.brandIndigo, in: Circle())
            .shadow(color: .black.opacity(0.1), radius: 3, y: 4)
            .overlay(alignment: .bottomTrailing) {
                Button(action: onChangePhoto) {
                    Icon(.camera2, size: 16).foregroundStyle(Color.white)
                        .frame(width: 28, height: 28)
                        .background(Color.brandSaffron, in: Circle())
                        .shadow(color: .black.opacity(0.1), radius: 1.5, y: 1)
                }
                .accessibilityLabel("Change photo")
            }
    }

    private var reviewNotice: some View {
        HStack(alignment: .top, spacing: Spacing.s2) {
            Icon(.infoRound, size: 18).foregroundStyle(Color.g13Secondary).padding(.top, Spacing.s0_5)
            Text("e.g13.profile.reviewNotice").textStyle(.g13CaptionRelaxed).foregroundStyle(Color.g13OnSurfaceVariant)
                .multilineTextAlignment(.leading)
        }
        .padding(Spacing.s2_5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.g13SurfaceContainerHigh.opacity(0.6), in: RoundedRectangle(cornerRadius: Radius.xs))
    }

    private func label(_ key: LocalizedStringKey) -> some View {
        Text(key).textStyle(.g13Caption).foregroundStyle(Color.g13OnSurfaceVariant)
    }

    private var legalNameField: some View {
        VStack(alignment: .leading, spacing: Spacing.s1) {
            label("e.g13.profile.legalName")
            HStack {
                Text(verbatim: draft.legalName).textStyle(.g13BodyMedium).foregroundStyle(Color.g13OnSurface)
                Spacer(minLength: 0)
                Icon(.lock, size: 18).foregroundStyle(Color.g13Outline)
            }
            .padding(.horizontal, Spacing.s3_5)
            .frame(height: 48)
            .background(Color.g13SurfaceContainer, in: RoundedRectangle(cornerRadius: Radius.md))
            Text("e.g13.profile.legalNameHint").textStyle(.g13Caption11).foregroundStyle(Color.g13Outline)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var specialisationsField: some View {
        VStack(alignment: .leading, spacing: Spacing.s1_5) {
            label("e.g13.profile.specialisations")
            FlowLayout(spacing: Spacing.s1_5) {
                ForEach(draft.specialisations, id: \.self) { tag in
                    HStack(spacing: Spacing.s1) {
                        Text(verbatim: tag).textStyle(.g13Caption).foregroundStyle(Color.g13Primary)
                        Button { draft.specialisations.removeAll { $0 == tag } } label: {
                            Icon(.close, size: 14).foregroundStyle(Color.g13Outline)
                        }
                        .accessibilityLabel("Remove \(tag)")
                    }
                    .padding(.horizontal, Spacing.s3).frame(height: 32)
                    .background(Color.surface, in: Capsule())
                    .overlay(Capsule().strokeBorder(Color.g13Border, lineWidth: BorderWidth.hairline))
                    .shadow(color: .black.opacity(0.05), radius: 1, y: 1)
                }
                Button(action: onAddTag) {
                    HStack(spacing: Spacing.s1) {
                        G13Icon("IconG13Plus", size: 14)
                        Text("e.g13.profile.addTag").textStyle(.g13Caption)
                    }
                    .foregroundStyle(Color.g13Secondary)
                    .padding(.horizontal, Spacing.s3).frame(height: 32)
                    .background(Color.g13SurfaceContainer, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var languagesField: some View {
        VStack(alignment: .leading, spacing: Spacing.s1) {
            label("e.g13.profile.languages")
            HStack(spacing: Spacing.s2) {
                ForEach(draft.languages, id: \.self) { language in
                    Text(verbatim: language).textStyle(.g13Body).foregroundStyle(Color.g13OnSurface)
                        .padding(.horizontal, Spacing.s3).padding(.vertical, Spacing.s1)
                        .g13Card(radius: Radius.xs)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var bioField: some View {
        VStack(alignment: .leading, spacing: Spacing.s1) {
            HStack {
                label("e.g13.profile.bio")
                Spacer(minLength: 0)
                Text(verbatim: "\(draft.bio.count) / \(draft.bioLimit) chars").textStyle(.g13Caption11).foregroundStyle(Color.g13Outline)
            }
            TextField("", text: $draft.bio, axis: .vertical)
                .textStyle(.g13Body13Relaxed).foregroundStyle(Color.g13OnSurface)
                .onChange(of: draft.bio) { _, new in if new.count > draft.bioLimit { draft.bio = String(new.prefix(draft.bioLimit)) } }
                .frame(maxWidth: .infinity, alignment: .leading)
                .g13Card(padding: Spacing.s3)
        }
    }

    private var educationField: some View {
        VStack(alignment: .leading, spacing: Spacing.s1) {
            label("e.g13.profile.education")
            TextField("", text: $draft.education)
                .textStyle(.g13Body13).foregroundStyle(Color.g13OnSurface)
                .lineLimit(1)
                .padding(.horizontal, Spacing.s3_5)
                .frame(height: 48)
                .g13Card()
        }
    }
}

extension ExpertProfileEditView where BottomBar == EmptyView {
    init(profile: ExpertProfileEdit, onBack: @escaping () -> Void = {}, onPreview: @escaping () -> Void = {},
         onChangePhoto: @escaping () -> Void = {}, onAddTag: @escaping () -> Void = {},
         onSubmit: @escaping (ExpertProfileEdit) -> Void = { _ in }) {
        self.init(profile: profile, onBack: onBack, onPreview: onPreview, onChangePhoto: onChangePhoto,
                  onAddTag: onAddTag, onSubmit: onSubmit, bottomBar: { EmptyView() })
    }
}

#Preview("E-16 Profile") { ExpertProfileEditView(profile: .sample) }
