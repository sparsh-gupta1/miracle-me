import SwiftUI

struct OnboardingSlide: Identifiable {
    let id: Int
    let illustration: String
    let title: LocalizedStringKey
    let body: LocalizedStringKey
    var showsSparkles = false

    static var all: [OnboardingSlide] { [
        .init(id: 0, illustration: "OnboardingTalk", title: "onboarding.talk.title",
              body: "onboarding.talk.body", showsSparkles: true),
        .init(id: 1, illustration: "OnboardingPrivate", title: "privacy.note",
              body: "onboarding.private.body"),
        .init(id: 2, illustration: "OnboardingFreeMinutes", title: "onboarding.free.title",
              body: "onboarding.free.body"),
    ] }
}
