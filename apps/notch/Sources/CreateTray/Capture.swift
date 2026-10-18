import AppKit
import ScreenCaptureKit
import CoreGraphics

/// STRETCH: hold Option >= 400ms -> crop around the cursor -> /api/extract -> /api/lift.
/// Everything is guarded; any failure surfaces as a short status line, never a crash.
@MainActor
final class CaptureController {
    weak var store: TrayStore?
    var onStatus: ((String?) -> Void)?

    private var optionSince: Date?
    private var fired = false
    private var busy = false

    func tick(screen: NSScreen, mouse: NSPoint) {
        let flags = NSEvent.modifierFlags.intersection(.deviceIndependentFlagsMask)
        guard flags == .option else { optionSince = nil; fired = false; return }
        if optionSince == nil { optionSince = Date() }
        guard !fired, !busy, let t = optionSince, Date().timeIntervalSince(t) >= 0.4 else { return }
        fired = true
        guard CGPreflightScreenCaptureAccess() else {
            CGRequestScreenCaptureAccess()
            onStatus?("Grant Screen Recording, then relaunch")
            clearStatusSoon()
            return
        }
        busy = true
        onStatus?("Capturing\u{2026}")
        Task { @MainActor in
            await self.run(screen: screen, mouse: mouse)
            self.busy = false
            self.clearStatusSoon()
        }
    }

    private func clearStatusSoon() {
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            if !busy { onStatus?(nil) }
        }
    }

    private func run(screen: NSScreen, mouse: NSPoint) async {
        do {
            guard let png = try await crop(screen: screen, mouse: mouse) else { onStatus?("Capture failed"); return }
            let dataURL = "data:image/png;base64," + png.base64EncodedString()
            guard dataURL.count < 6_000_000 else { onStatus?("Crop too large"); return }
            onStatus?("Reading\u{2026}")
            guard let ext = await post("api/extract", ["image": dataURL, "hint": "option-hold crop at cursor"]),
                  let entity = ext["entity"] else { onStatus?("Extract failed"); return }
            onStatus?("Lifting\u{2026}")
            guard let lift = await post("api/lift", ["entity": entity]),
                  let url = lift["url"] as? String else { onStatus?("Lift failed"); return }
            let e = entity as? [String: Any]
            let title = (e?["title"] as? String) ?? (e?["name"] as? String) ?? "Capture"
            let kind = (e?["kind"] as? String) ?? (e?["type"] as? String) ?? "capture"
            store?.addLocal(TrayItem(id: "local-\((lift["id"] as? String) ?? UUID().uuidString)",
                                     title: title, kind: kind, url: url, createdAt: ""))
            onStatus?(nil)
        } catch {
            onStatus?("Capture failed")
        }
    }

    private func crop(screen: NSScreen, mouse: NSPoint) async throws -> Data? {
        let content = try await SCShareableContent.current
        let id = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID
        guard let display = content.displays.first(where: { $0.displayID == id }) ?? content.displays.first else { return nil }
        let w: CGFloat = 520, h: CGFloat = 360
        let f = screen.frame
        let x = min(max(mouse.x - f.minX - w / 2, 0), max(f.width - w, 0))
        let yTop = f.maxY - mouse.y                       // flip to top-left origin
        let y = min(max(yTop - h / 2, 0), max(f.height - h, 0))
        let cfg = SCStreamConfiguration()
        cfg.sourceRect = CGRect(x: x, y: y, width: min(w, f.width), height: min(h, f.height))
        cfg.width = Int(cfg.sourceRect.width * 2)
        cfg.height = Int(cfg.sourceRect.height * 2)
        cfg.showsCursor = false
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let img = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: cfg)
        return NSBitmapImageRep(cgImage: img).representation(using: .png, properties: [:])
    }

    private func post(_ path: String, _ body: [String: Any]) async -> [String: Any]? {
        guard JSONSerialization.isValidJSONObject(body),
              let data = try? JSONSerialization.data(withJSONObject: body) else { return nil }
        var req = URLRequest(url: Endpoints.api.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = data
        req.timeoutInterval = 30
        guard let (d, r) = try? await URLSession.shared.data(for: req),
              (r as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) == true else { return nil }
        return (try? JSONSerialization.jsonObject(with: d)) as? [String: Any]
    }
}
