import SwiftUI

/// +91 phone input. `digits` holds only the raw digits (max 10); display is "XXXXX XXXXX".
struct PhoneNumberField: View {
    @Binding var digits: String
    var showsValidity = false

    static let length = 10
    private var isValid: Bool { digits.count == Self.length }

    var body: some View {
        HStack(spacing: 0) {
            HStack(spacing: Spacing.s1_5) {
                Text("🇮🇳").textStyle(.bodyDefault)
                Text(verbatim: "+91").textStyle(.bodyStrong).foregroundStyle(.textPrimary)
            }
            .padding(.trailing, Spacing.s3)
            .overlay(alignment: .trailing) {
                Rectangle().fill(Color.brandBorder).frame(width: BorderWidth.hairline)
            }
            TextField("", text: formatted)
                .keyboardType(.numberPad)
                .textContentType(.telephoneNumber)
                .textStyle(.input)
                .foregroundStyle(.textPrimary)
                .padding(.leading, Spacing.s3_5)
            if showsValidity && isValid {
                Icon(.check, size: 20).foregroundStyle(.statusOnlineDot)
            }
        }
        .padding(.horizontal, Spacing.s3_5)
        .frame(height: 52)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.lg))
        .overlay(RoundedRectangle(cornerRadius: Radius.lg).strokeBorder(Color.brandIndigo, lineWidth: BorderWidth.hairline))
        .elevationSm()
    }

    private var formatted: Binding<String> {
        Binding(
            get: {
                guard digits.count > 5 else { return digits }
                return "\(digits.prefix(5)) \(digits.dropFirst(5))"
            },
            set: { digits = String($0.filter(\.isNumber).prefix(Self.length)) }
        )
    }
}

/// Small caption above a field.
struct FieldLabel: View {
    let text: LocalizedStringKey
    var style: TextStyle = .label
    var color: Color = .textSecondary

    var body: some View {
        Text(text).textStyle(style).foregroundStyle(color)
    }
}
