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
    case "design", "component": return "paintpalette"
    case "chart": return "chart.bar"
    case "image", "screenshot": return "photo"
    case "form": return "list.bullet.rectangle"
    case "text", "note": return "text.alignleft"
    default: return "square.on.square"
    }
}

func openURL(_ s: String) {
    guard let u = URL(string: s), ["http", "https"].contains(u.scheme?.lowercased() ?? "") else { return }
    NSWorkspace.shared.open(u)
}

struct ChipView: View {
    let item: TrayItem
    @State private var hover = false
    var body: some View {
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
            }
            .padding(.horizontal, 12)
            .frame(height: 32)
            .frame(maxWidth: 260, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(hover ? Tok.chipHover : Tok.chip))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Tok.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
        .help(item.url)
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
            if store.items.isEmpty {
                Text(store.online ? "Nothing here yet. Lift something from the page." : "Waiting for Create on localhost:3001")
                    .font(.system(size: 12))
                    .foregroundStyle(Tok.ink2)
                    .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
            } else {
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(store.items) { item in
                            ChipView(item: item)
                                .transition(.asymmetric(
                                    insertion: .move(edge: .top).combined(with: .opacity).combined(with: .scale(scale: 0.9)),
                                    removal: .opacity))
                        }
                    }
                }
                .frame(maxHeight: 150)
            }
        }
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
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .frame(minWidth: 18, minHeight: 16)
                    .background(Capsule().fill(Tok.accent))
            }
        }
        .padding(.trailing, 6)
    }
}
