import SwiftUI

/// White rounded input surface.
struct FieldBox<Content: View>: View {
    var height: CGFloat = 44
    var horizontalPadding: CGFloat = Spacing.s3_5
    var radius: CGFloat = Radius.md
    @ViewBuilder var content: Content

    var body: some View {
        HStack(spacing: 0) { content }
            .padding(.horizontal, horizontalPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: height)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(Color.brandBorder, lineWidth: BorderWidth.hairline))
    }
}

/// Caption + field stack. `label` may carry a muted suffix, e.g. "(optional)".
struct LabeledField<Content: View>: View {
    let label: LocalizedStringKey
    var suffix: LocalizedStringKey?
    var spacing: CGFloat = Spacing.s1_5
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) {
            HStack(spacing: Spacing.s1) {
                Text(label).textStyle(.xsSemibold).foregroundStyle(.brandIndigo)
                if let suffix { Text(suffix).textStyle(.xs).foregroundStyle(.textMuted) }
            }
            content
        }
    }
}

struct AppTextField: View {
    @Binding var text: String
    var placeholder: LocalizedStringKey = ""
    var height: CGFloat = 44
    var horizontalPadding: CGFloat = Spacing.s3_5
    var style: TextStyle = .field

    var body: some View {
        FieldBox(height: height, horizontalPadding: horizontalPadding) {
            TextField(placeholder, text: $text)
                .textStyle(style)
                .foregroundStyle(.brandIndigo)
        }
    }
}

/// Field that shows a formatted date and edits it through the system picker.
struct DateField: View {
    @Binding var date: Date?
    var components: DatePickerComponents = .date
    let format: String
    var placeholder: LocalizedStringKey = ""
    var height: CGFloat = 44
    var horizontalPadding: CGFloat = Spacing.s3_5
    var style: TextStyle = .field

    var body: some View {
        FieldBox(height: height, horizontalPadding: horizontalPadding) {
            if let date {
                Text(verbatim: Self.string(date, format: format))
                    .textStyle(style).foregroundStyle(.brandIndigo)
            } else {
                Text(placeholder).textStyle(style).foregroundStyle(.textMuted)
            }
        }
        .overlay {
            DatePicker("", selection: Binding(get: { date ?? .now }, set: { date = $0 }), displayedComponents: components)
                .labelsHidden()
                .colorMultiply(.clear)
        }
    }

    private static func string(_ date: Date, format: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = format
        return formatter.string(from: date)
    }
}
