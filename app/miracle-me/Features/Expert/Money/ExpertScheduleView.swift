import SwiftUI

enum ScheduleDay: Int, CaseIterable, Hashable {
    case mon, tue, wed, thu, fri, sat, sun

    var shortName: String { ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][rawValue] }
}

struct ScheduleSlot: Identifiable, Hashable {
    let id: String
    /// "10:00 AM – 01:30 PM"
    let rangeText: String
    /// "Morning Session • All channels"
    let detail: String
}

/// E-15 — weekly schedule & auto-availability.
struct ExpertScheduleView: View {
    @State var autoOnline: Bool
    @State var days: Set<ScheduleDay>
    @State var slots: [ScheduleSlot]
    var onBack: () -> Void = {}
    var onAddSlot: () -> Void = {}
    var onRemoveSlot: (ScheduleSlot) -> Void = { _ in }
    var onSetVacation: () -> Void = {}
    var onSave: (Bool, Set<ScheduleDay>, [ScheduleSlot]) -> Void = { _, _, _ in }

    var body: some View {
        G12Screen {
            G12Header(title: "e.g12.schedule.title", onBack: onBack) {
                G12IconButton(icon: "IconG12Plus", size: 18, label: "Add slot", action: onAddSlot)
            }
        } content: {
            autoCard
            dayPills
            slotsCard
            vacationCard
            G12PrimaryButton(title: "e.g12.schedule.update") { onSave(autoOnline, days, slots) }
                .padding(.top, Spacing.s1)
        }
    }

    private var autoCard: some View {
        HStack {
            VStack(alignment: .leading, spacing: Spacing.s0_5) {
                Text("e.g12.schedule.autoTitle").textStyle(.g12Sec13).foregroundStyle(.brandIndigo)
                Text("e.g12.schedule.autoHint").textStyle(.g12Meta).foregroundStyle(.g12Muted)
            }
            Spacer(minLength: Spacing.s3)
            Toggle("", isOn: $autoOnline).labelsHidden().toggleStyle(G12SwitchStyle())
        }
        .g12Card()
    }

    private var dayPills: some View {
        ScrollView(.horizontal) {
            HStack(spacing: Spacing.s1_5) {
                ForEach(ScheduleDay.allCases, id: \.self) { day in
                    Button { toggle(day) } label: {
                        Text(verbatim: day.shortName).textStyle(.xsSemibold)
                            .foregroundStyle(days.contains(day) ? Color.white : Color.g12PillText)
                            .padding(.horizontal, 11).padding(.vertical, Spacing.s1_5)
                            .background(days.contains(day) ? Color.brandIndigo : Color.g12Pill, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(days.contains(day) ? .isSelected : [])
                }
            }
        }
        .scrollIndicators(.hidden)
    }

    private func toggle(_ day: ScheduleDay) {
        if days.contains(day) { days.remove(day) } else { days.insert(day) }
    }

    private var slotsCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("e.g12.schedule.slotsTitle \(rangeLabel)").textStyle(.g12Sec125).foregroundStyle(.brandIndigo)
                Spacer(minLength: Spacing.s2)
                Button(action: onAddSlot) {
                    Text("e.g12.schedule.addSlot").textStyle(.g12MetaBold).foregroundStyle(.brandSaffron)
                }
                .buttonStyle(.plain)
            }
            .padding(.bottom, Spacing.s3)
            VStack(spacing: Spacing.s2) {
                ForEach(slots) { slot in
                    HStack {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(verbatim: slot.rangeText).textStyle(.g12Item13).foregroundStyle(.brandIndigo)
                            Text(verbatim: slot.detail).textStyle(.g12Caption105).foregroundStyle(.g12Muted)
                        }
                        Spacer(minLength: Spacing.s2)
                        Button { slots.removeAll { $0.id == slot.id }; onRemoveSlot(slot) } label: {
                            Icon(.close, size: 15).foregroundStyle(.g12Muted).frame(width: 36, height: 36)
                        }
                        .accessibilityLabel("Remove slot")
                    }
                    .padding(.leading, Spacing.s2_5)
                    .padding(.vertical, Spacing.s2_5 - 8)
                    .padding(.trailing, Spacing.s1)
                    .background(Color.brandBackground, in: RoundedRectangle(cornerRadius: Radius.xs))
                    .overlay(RoundedRectangle(cornerRadius: Radius.xs).strokeBorder(Color.g12CardBorder, lineWidth: BorderWidth.hairline))
                }
            }
        }
        .g12Card()
    }

    /// "Mon - Fri" for a consecutive run, otherwise a comma list.
    private var rangeLabel: String {
        let sorted = days.sorted { $0.rawValue < $1.rawValue }
        guard let first = sorted.first, let last = sorted.last else { return "—" }
        if sorted.count > 2, last.rawValue - first.rawValue == sorted.count - 1 { return "\(first.shortName) - \(last.shortName)" }
        return sorted.map(\.shortName).joined(separator: ", ")
    }

    private var vacationCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("e.g12.schedule.vacationTitle").textStyle(.g12Para12).foregroundStyle(.brandIndigo).padding(.bottom, Spacing.s0_5)
            Text("e.g12.schedule.vacationBody").textStyle(.g12Para11).foregroundStyle(.g12Body).padding(.bottom, Spacing.s2)
            Button(action: onSetVacation) {
                Text("e.g12.schedule.vacationAction").textStyle(.g12MetaBold).foregroundStyle(.brandSaffron)
                    .padding(.horizontal, Spacing.s3).padding(.vertical, Spacing.s1_5)
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color.brandSaffron, lineWidth: BorderWidth.hairline))
            }
            .buttonStyle(.plain)
        }
        .g12Card(accent: .brandSaffron)
    }
}

/// 44×24 pill switch with an 18-pt knob (green when on).
struct G12SwitchStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            Capsule().fill(configuration.isOn ? Color.g12Green : Color.g12ToggleOff)
                .frame(width: 44, height: 24)
                .overlay(alignment: configuration.isOn ? .trailing : .leading) {
                    Circle().fill(Color.white).frame(width: 18, height: 18).padding(3)
                }
                .animation(.easeInOut(duration: 0.2), value: configuration.isOn)
        }
        .buttonStyle(.plain)
        .accessibilityValue(configuration.isOn ? "On" : "Off")
        .accessibilityAddTraits(.isToggle)
    }
}

extension ScheduleSlot {
    static let samples: [ScheduleSlot] = [
        .init(id: "s1", rangeText: "10:00 AM – 01:30 PM", detail: "Morning Session • All channels"),
        .init(id: "s2", rangeText: "05:00 PM – 09:30 PM", detail: "Evening Peak • Chat & Audio only"),
    ]
}

#Preview("E-15 Schedule") {
    ExpertScheduleView(autoOnline: true, days: [.mon, .tue, .wed, .thu, .fri], slots: ScheduleSlot.samples)
}
