import SwiftUI
import AppKit
import UniformTypeIdentifiers

// Tokens from DESIGN.md. On a notched display the surface is physically black, so the tray uses the dark
// rendition of the neutral ramp there; on other displays DynamicNotchKit draws a popover material and the
// tokens follow the system light/dark appearance. One accent (#3E7BF0).
enum Tok {
    static let accent = Color(red: 0x3E / 255, green: 0x7B / 255, blue: 0xF0 / 255)
    /// True when the primary screen has a notch (always dark there).
    static var notched: Bool { (NSScreen.screens.first?.safeAreaInsets.top ?? 0) > 0 }
    private static func dyn(_ light: NSColor, _ dark: NSColor) -> Color {
        Color(nsColor: NSColor(name: nil) { ap in
            if notched { return dark }
            return ap.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
        })
    }
    static let ink = dyn(NSColor(white: 0.05, alpha: 1), .white)
    static let ink2 = dyn(NSColor(white: 0.36, alpha: 1), NSColor(white: 0.70, alpha: 1))
    static let ink3 = dyn(NSColor(white: 0.46, alpha: 1), NSColor(white: 0.52, alpha: 1))
    static let chip = dyn(NSColor(white: 0, alpha: 0.05), NSColor(white: 1, alpha: 0.08))
    static let chipHover = dyn(NSColor(white: 0, alpha: 0.09), NSColor(white: 1, alpha: 0.15))
    static let line = dyn(NSColor(white: 0, alpha: 0.10), NSColor(white: 1, alpha: 0.10))
    static let thumbBG = dyn(NSColor(white: 0, alpha: 0.04), NSColor(white: 1, alpha: 0.05))
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

/// One tray card: thumbnail over a one-line title. Click opens in Create, drag carries the image + HTML out,
/// the corner x removes it. Hover raises the border and reports itself so the preview can show.
struct CardView: View {
    @ObservedObject var store: TrayStore
    let item: TrayItem
    var onHover: (Bool) -> Void
    @State private var hover = false
    @State private var overX = false
    static let width: CGFloat = 132
    static let thumbHeight: CGFloat = 80

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Button { store.open(item) } label: {
                VStack(alignment: .leading, spacing: 0) {
                    ThumbView(store: store, item: item)
                        .frame(width: Self.width, height: Self.thumbHeight)
                        .clipped()
                    HStack(spacing: 5) {
                        Image(systemName: symbol(for: item.kind)).font(.system(size: 10, weight: .medium)).foregroundStyle(Tok.accent)
                        Text(item.title).font(.system(size: 11, weight: .medium)).foregroundStyle(Tok.ink).lineLimit(1).truncationMode(.tail)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 8).frame(width: Self.width, height: 26, alignment: .leading)
                }
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(hover ? Tok.chipHover : Tok.chip))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(hover ? Tok.accent.opacity(0.55) : Tok.line, lineWidth: 1))
                .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .buttonStyle(.plain)
            .onDrag { dragProvider() }
            Button { store.dismiss(item) } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(overX ? Tok.ink : Tok.ink2)
                    .frame(width: 18, height: 18)
                    .background(Circle().fill(.ultraThinMaterial))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .padding(5)
            .opacity(hover ? 1 : 0)
            .scaleEffect(hover || Motion.reduced ? 1 : 0.8)
            .onHover { h in withAnimation(Motion.hover) { overX = h } }
            .help("Remove")
            .accessibilityLabel("Remove \(item.title)")
        }
        .frame(width: Self.width)
        .scaleEffect(hover && !Motion.reduced ? 1.015 : 1)
        .onHover { h in
            withAnimation(Motion.hover) { hover = h }
            onHover(h)
        }
        .onAppear { store.loadThumb(item) }
        .accessibilityElement(children: .contain)
    }

    /// Drag out: the thumbnail as an image, plus the markup (text/html and plain text) and the link when there is one.
    private func dragProvider() -> NSItemProvider {
        let provider = NSItemProvider()
        if let img = store.thumbs[item.id] {
            provider.registerObject(img, visibility: .all)
        }
        let item = self.item
        let store = self.store
        if item.hasSnippet {
            for type in [UTType.html, UTType.plainText] {
                provider.registerDataRepresentation(forTypeIdentifier: type.identifier, visibility: .all) { done in
                    Task { @MainActor in
                        let html = await store.snippetHTML(item) ?? item.title
                        done(html.data(using: .utf8), nil)
                    }
                    return nil
                }
            }
        } else if !item.url.isEmpty, let u = URL(string: item.url) {
            provider.registerObject(u as NSURL, visibility: .all)
        }
        provider.suggestedName = item.title
        return provider
    }
}

struct ThumbView: View {
    @ObservedObject var store: TrayStore
    let item: TrayItem
    var fill = true
    var body: some View {
        ZStack {
            Tok.thumbBG
            if let img = store.thumbs[item.id] {
                Image(nsImage: img)
                    .resizable()
                    .aspectRatio(contentMode: fill ? .fill : .fit)
                    .transition(.opacity)
            } else {
                Image(systemName: symbol(for: item.kind))
                    .font(.system(size: 20, weight: .regular))
                    .foregroundStyle(Tok.ink3)
            }
        }
        .animation(Motion.spring, value: store.thumbs[item.id] != nil)
    }
}

/// The bigger look at the hovered card: larger thumbnail, title, and where it came from.
struct PreviewView: View {
    @ObservedObject var store: TrayStore
    let item: TrayItem
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ThumbView(store: store, item: item, fill: false)
                .frame(width: 220, height: 132)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Tok.line, lineWidth: 1))
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title).font(.system(size: 13, weight: .semibold)).foregroundStyle(Tok.ink).lineLimit(3)
                Text(item.sourceLine).font(.system(size: 11)).foregroundStyle(Tok.ink3).lineLimit(2)
                Spacer(minLength: 0)
                Text("Click to open in Create \u{00B7} drag to use elsewhere").font(.system(size: 11)).foregroundStyle(Tok.ink2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Tok.chip))
        .onAppear { store.loadThumb(item) }
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
    /// The card being previewed. Cleared a beat after the pointer leaves so moving between cards does not flicker.
    @State private var shown: TrayItem?
    @State private var clearTask: Task<Void, Never>?

    private func setHover(_ item: TrayItem, _ over: Bool) {
        clearTask?.cancel()
        if over {
            withAnimation(Motion.spring) { shown = item }
        } else {
            clearTask = Task { @MainActor in
                try? await Task.sleep(nanoseconds: 140_000_000)
                if !Task.isCancelled { withAnimation(Motion.spring) { shown = nil } }
            }
        }
    }

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
                Text(store.online ? "Nothing here yet. Circle something on a page to save it." : "Waiting for Create on localhost:3001")
                    .font(.system(size: 12))
                    .foregroundStyle(Tok.ink2)
                    .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(alignment: .top, spacing: 8) {
                        ForEach(store.items) { item in
                            CardView(store: store, item: item) { over in setHover(item, over) }
                                .transition(.chipDrop)
                        }
                    }
                    .padding(.horizontal, 2)
                    .padding(.vertical, 2)
                }
                .frame(height: CardView.thumbHeight + 26 + 6)
                .animation(Motion.spring, value: store.items)
                if let h = shown {
                    PreviewView(store: store, item: h)
                        .transition(.chipDrop)
                        .id(h.id)
                }
            }
        }
        .animation(Motion.spring, value: store.locate)
        .animation(Motion.spring, value: shown)
        .frame(minWidth: 380, maxWidth: 560)
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
