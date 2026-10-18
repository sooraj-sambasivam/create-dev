import SwiftUI
import AppKit

// Tokens from DESIGN.md. The notch surface is physically black, so the tray is a dark
// rendition of the same neutral ramp with the single accent (#3E7BF0).
enum Tok {
    static let accent = Color(red: 0x3E / 255, green: 0x7B / 255, blue: 0xF0 / 255)
    static let ink = Color.white
    static let ink2 = Color(white: 0.70)
    static let ink3 = Color(white: 0.52)
    static let chip = Color(white: 1, opacity: 0.08)
    static let chipHover = Color(white: 1, opacity: 0.15)
    static let line = Color(white: 1, opacity: 0.10)
}

func symbol(for kind: String) -> String {
    switch kind.lowercased() {
    case "table": return "tablecells"
    case "chart": return "chart.bar.xaxis"
    case "list": return "list.bullet"
    case "schedule": return "calendar"
    case "cards", "card": return "rectangle.grid.2x2"
    case "capture", "image", "screenshot": return "viewfinder"
    case "design", "component": return "paintpalette"
    case "form": return "list.bullet.rectangle"
    case "text", "note": return "text.alignleft"
    default: return "square.on.square"
    }
}

/// Drop-in: slight scale + blur + fade, from above.
struct DropIn: ViewModifier {
    let active: Bool
    func body(content: Content) -> some View {
        content
            .opacity(active ? 0 : 1)
            .scaleEffect(active ? 0.94 : 1, anchor: .top)
            .blur(radius: active ? 6 : 0)
            .offset(y: active ? -8 : 0)
    }
}
extension AnyTransition {
    static var chipDrop: AnyTransition {
        if Motion.reduced { return .opacity }
        return .asymmetric(
            insertion: .modifier(active: DropIn(active: true), identity: DropIn(active: false)),
            removal: .modifier(active: DropIn(active: true), identity: DropIn(active: false)))
    }
}

func openURL(_ s: String) {
    guard let u = URL(string: s), ["http", "https"].contains(u.scheme?.lowercased() ?? "") else { return }
    NSWorkspace.shared.open(u)
}

struct ChipView: View {
    let item: TrayItem
    var onDismiss: () -> Void
    @State private var hover = false
    @State private var overX = false
    var body: some View {
        ZStack(alignment: .trailing) {
            Button { openURL(item.url) } label: {
                HStack(spacing: 8) {
                    Image(systemName: symbol(for: item.kind))
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Tok.accent)
                        .frame(width: 16)
                    Text("\(item.kind.capitalized) \u{00B7} \(item.title)")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Tok.ink)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Spacer(minLength: 0)
                }
                .padding(.leading, 12)
                .padding(.trailing, 32)
                .frame(height: 32)
                .frame(maxWidth: 300, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(hover ? Tok.chipHover : Tok.chip))
                .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(hover ? Tok.accent.opacity(0.45) : Tok.line, lineWidth: 1))
                .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(overX ? Tok.ink : Tok.ink3)
                    .frame(width: 20, height: 20)
                    .background(Circle().fill(overX ? Color(white: 1, opacity: 0.18) : .clear))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .padding(.trailing, 6)
            .opacity(hover ? 1 : 0)
            .scaleEffect(hover || Motion.reduced ? 1 : 0.8)
            .onHover { h in withAnimation(Motion.hover) { overX = h } }
            .help("Dismiss")
            .accessibilityLabel("Dismiss \(item.title)")
        }
        .scaleEffect(hover && !Motion.reduced ? 1.008 : 1)
        .onHover { h in withAnimation(Motion.hover) { hover = h } }
        .help(item.url)
    }
}

struct LocateChipView: View {
    let state: LocateState
    var onPick: (Int) -> Void
    var body: some View {
        switch state {
        case .label(let kind, let text, let tip, let working):
            HStack(spacing: 8) {
                Image(systemName: symbol(for: kind)).font(.system(size: 14, weight: .medium)).foregroundStyle(Tok.accent).frame(width: 16)
                Text(text.isEmpty ? kind.capitalized : "\(kind.capitalized) \u{00B7} \(text)")
                    .font(.system(size: 12, weight: .medium)).foregroundStyle(Tok.ink).lineLimit(1).truncationMode(.tail)
                Spacer(minLength: 0)
                if let working { Text(working).font(.system(size: 11)).foregroundStyle(Tok.ink3) }
            }
            .padding(.horizontal, 12).frame(height: 32)
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Tok.chip))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Tok.accent.opacity(0.45), lineWidth: 1))
            .help(tip)
            .accessibilityLabel("Found \(text)")
        case .ask(let prompt, let options, let tip):
            VStack(alignment: .leading, spacing: 6) {
                Text(prompt).font(.system(size: 12, weight: .semibold)).foregroundStyle(Tok.ink)
                HStack(spacing: 6) {
                    ForEach(Array(options.prefix(2).enumerated()), id: \.offset) { i, o in
                        Button { onPick(i) } label: {
                            Text(o).font(.system(size: 12, weight: .medium)).foregroundStyle(.white).lineLimit(1)
                                .padding(.horizontal, 12).frame(height: 28).frame(maxWidth: .infinity)
                                .background(Capsule().fill(i == 0 ? Tok.accent : Tok.chipHover))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .help(tip)
        case .error(let msg, let tip):
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 13)).foregroundStyle(Color.orange).frame(width: 16)
                Text(msg).font(.system(size: 12)).foregroundStyle(Tok.ink).lineLimit(3).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.orange.opacity(0.12)))
            .help(tip)
        }
    }
}

struct TrayContent: View {
    @ObservedObject var store: TrayStore

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text("Tray")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Tok.ink)
                Text(store.status ?? (store.items.isEmpty ? "" : "\(store.items.count)"))
                    .font(.system(size: 12))
                    .foregroundStyle(Tok.ink3)
                    .contentTransition(.numericText())
                    .animation(Motion.spring, value: store.items.count)
                Spacer(minLength: 24)
                Button { openURL(Endpoints.web.absoluteString) } label: {
                    HStack(spacing: 6) {
                        Text("Send to Create").font(.system(size: 12, weight: .medium))
                        Image(systemName: "arrow.up.right").font(.system(size: 11, weight: .semibold))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .frame(height: 28)
                    .background(Capsule().fill(Tok.accent))
                }
                .buttonStyle(.plain)
            }
            if let st = store.locate {
                LocateChipView(state: st) { store.onPick?($0) }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .transition(.chipDrop)
            }
            if store.items.isEmpty {
                Text(store.online ? "Nothing here yet. Lift something from the page." : "Waiting for Create on localhost:3001")
                    .font(.system(size: 12))
                    .foregroundStyle(Tok.ink2)
                    .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
            } else {
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(store.items) { item in
                            ChipView(item: item) { store.dismiss(item) }
                                .transition(.chipDrop)
                        }
                    }
                }
                .frame(maxHeight: 150)
                .animation(Motion.spring, value: store.items)
            }
        }
        .animation(Motion.spring, value: store.locate)
        .frame(minWidth: 340)
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .padding(.bottom, 8)
    }
}

struct CompactLeading: View {
    @ObservedObject var store: TrayStore
    var body: some View {
        Image(systemName: "tray.fill")
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(store.items.isEmpty ? Tok.ink3 : Tok.ink)
            .padding(.leading, 6)
    }
}

struct CompactTrailing: View {
    @ObservedObject var store: TrayStore
    var body: some View {
        Group {
            if store.items.isEmpty {
                Circle().fill(store.online ? Color(white: 0.35) : Color(white: 0.2)).frame(width: 6, height: 6)
            } else {
                Text("\(store.items.count)")
                    .font(.system(size: 11, weight: .semibold).monospacedDigit())
                    .foregroundStyle(.white)
                    .contentTransition(.numericText(value: Double(store.items.count)))
                    .padding(.horizontal, 6)
                    .frame(minWidth: 18, minHeight: 16)
                    .background(Capsule().fill(Tok.accent))
            }
        }
        .padding(.trailing, 6)
        .animation(Motion.spring, value: store.items.count)
    }
}
