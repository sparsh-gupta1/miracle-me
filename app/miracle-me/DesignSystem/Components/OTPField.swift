import SwiftUI

/// Four discrete boxes backed by one hidden text field (supports SMS auto-fill).
struct OTPField: View {
    @Binding var code: String
    var isError = false
    @FocusState private var focused: Bool
    @State private var cursorDimmed = false

    static let length = 4

    var body: some View {
        ZStack {
            TextField("", text: digits)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .focused($focused)
                .opacity(0.01)
                .frame(width: 1, height: 1)
            HStack(spacing: Spacing.s3_5) {
                ForEach(0..<Self.length, id: \.self) { box($0) }
            }
            .contentShape(Rectangle())
            .onTapGesture { focused = true }
        }
        .frame(maxWidth: .infinity)
        .onAppear {
            focused = true
            // Tailwind animate-pulse for the cursor box.
            withAnimation(.timingCurve(0.4, 0, 0.6, 1, duration: 1).repeatForever(autoreverses: true)) { cursorDimmed = true }
        }
    }

    private var digits: Binding<String> {
        Binding(get: { code }, set: { code = String($0.filter(\.isNumber).prefix(Self.length)) })
    }

    private enum BoxState { case error, filled, cursor, empty }

    private func state(at index: Int) -> BoxState {
        if isError { return .error }
        if index < code.count { return .filled }
        if index == code.count { return .cursor }
        return .empty
    }

    @ViewBuilder private func box(_ index: Int) -> some View {
        let state = state(at: index)
        let shape = RoundedRectangle(cornerRadius: Radius.lg)
        let character = index < code.count ? String(Array(code)[index]) : (state == .cursor ? "|" : "")
        Text(verbatim: character)
            .textStyle(.otpDigit)
            .foregroundStyle(state == .error ? Color.statusCritical : Color.brandIndigo)
            .frame(width: 56, height: 56)
            .background(state == .error ? Color.statusCriticalBackground : state == .cursor ? Color.brandBackground : Color.surface, in: shape)
            .overlay(shape.strokeBorder(borderColor(state), lineWidth: state == .empty ? BorderWidth.hairline : BorderWidth.strong))
            .shadow(color: .black.opacity(state == .filled || state == .cursor ? 0.05 : 0), radius: 1, y: 1)
            .opacity(state == .cursor && cursorDimmed ? 0.5 : 1)
    }

    private func borderColor(_ state: BoxState) -> Color {
        switch state {
        case .error: .statusCritical
        case .filled: .brandIndigo
        case .cursor: .brandSaffron
        case .empty: .brandBorder
        }
    }
}
