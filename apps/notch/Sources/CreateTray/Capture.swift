import AppKit
import ScreenCaptureKit
import CoreGraphics
import os

private let signposter = OSSignposter(subsystem: "dev.create.tray", category: "pipeline")
private let plog = Logger(subsystem: "dev.create.tray", category: "pipeline")

struct PipeError: Error { let message: String }

/// A located target, boxes in image pixels (the crop that was sent).
struct Located {
    var box: CGRect
    var kind: String
    var label: String
    var source: String
    var confidence: Double
    var candidates: [Located] = []

    static func parse(_ d: [String: Any]?) -> Located? {
        guard let d, let b = d["box"] as? [String: Any],
              let x = num(b["x"]), let y = num(b["y"]), let w = num(b["w"]), let h = num(b["h"]) else { return nil }
        var l = Located(box: CGRect(x: x, y: y, width: w, height: h),
                        kind: (d["kind"] as? String) ?? "other", label: (d["label"] as? String) ?? "",
                        source: (d["source"] as? String) ?? "", confidence: num(d["confidence"]) ?? 0)
        l.candidates = ((d["candidates"] as? [[String: Any]]) ?? []).compactMap { parse($0) }
        return l
    }
    private static func num(_ v: Any?) -> Double? { (v as? NSNumber)?.doubleValue }
}

struct Shot {
    let image: CGImage
    let cropTL: CGRect        // crop in global top-left points
    let scale: CGFloat        // image pixels per point
}

private enum Pick { case box(Located), whole, cancel }
private struct Pending { let shot: Shot; let trace: String; let picks: [Pick] }

/// Option-hold >= 400ms -> AX at cursor + ScreenCaptureKit crop -> /api/locate -> label chip
/// -> /api/extract -> /api/lift -> tray chip. Every failure is shown; nothing fails silently.
@MainActor
final class CaptureController {
    weak var store: TrayStore?
    var onStatus: ((String?) -> Void)?
    var onPeek: ((TimeInterval) -> Void)?

    private var optionSince: Date?
    private var fired = false
    private var busy = false
    private var promptedAX = false
    private var pending: Pending?
    private var gen = 0
    private var timings: [String] = []

    func tick(screen _: NSScreen, mouse: NSPoint) {
        let flags = NSEvent.modifierFlags.intersection(.deviceIndependentFlagsMask)
        guard flags == .option else { optionSince = nil; fired = false; return }
        if optionSince == nil { optionSince = Date() }
        guard !fired, !busy, let t = optionSince, Date().timeIntervalSince(t) >= 0.4 else { return }
        fired = true
        guard CGPreflightScreenCaptureAccess() else {
            CGRequestScreenCaptureAccess()
            show(.error("Screen Recording is not granted. Enable Create Tray in Privacy & Security, then relaunch.", tip: "capture blocked"), hold: 10)
            return
        }
        if !AXProbe.trusted && !promptedAX { promptedAX = true; AXProbe.ensureTrust(prompt: true) }
        busy = true
        pending = nil
        gen += 1
        onStatus?("Capturing\u{2026}")
        Task { @MainActor in
            await self.run(mouse: mouse)
            self.busy = false
        }
    }

    /// Called by the "Which one?" buttons.
    func pick(_ index: Int) {
        guard let p = pending, !busy, index < p.picks.count else { return }
        pending = nil
        gen += 1
        busy = true
        Task { @MainActor in
            switch p.picks[index] {
            case .cancel: store?.locate = nil
            case .whole: await self.finish(p.shot, box: nil, label: "Capture", kind: "capture", trace: p.trace, tip: "trace \(p.trace) \u{00B7} whole crop")
            case .box(let l): await self.finish(p.shot, box: l.box, label: l.label, kind: l.kind, trace: p.trace, tip: self.tip(trace: p.trace, l))
            }
            self.busy = false
        }
    }

    // MARK: Pipeline

    private func run(mouse: NSPoint) async {
        timings = []
        let localTrace = "n-" + String(UUID().uuidString.prefix(6)).lowercased()
        let screens = NSScreen.screens
        guard let primary = screens.first else { show(.error("No display found", tip: localTrace), hold: 6); return }
        let screen = screens.first { $0.frame.contains(mouse) } ?? primary
        let cursor = CGPoint(x: mouse.x, y: primary.frame.height - mouse.y)   // global top-left points

        var ax: AxNodeSnap?
        if AXProbe.trusted {
            ax = await stage("ax", localTrace) { await Task.detached { AXProbe.probe(at: cursor) }.value }
        }
        let shot: Shot
        do {
            shot = try await stage("capture", localTrace) { try await self.capture(screen: screen, primaryH: primary.frame.height, cursor: cursor, ax: ax) }
        } catch let e as PipeError {
            show(.error("Capture failed: \(e.message)", tip: localTrace), hold: 8); return
        } catch {
            show(.error("Capture failed: \(error.localizedDescription)", tip: localTrace), hold: 8); return
        }
        guard let dataURL = Self.dataURL(shot.image) else {
            show(.error("Crop too large to send", tip: localTrace), hold: 6); return
        }

        var input: [String: Any] = [
            "source": "notch", "image": dataURL,
            "imageSize": ["w": shot.image.width, "h": shot.image.height],
            "cursor": ["x": Double((cursor.x - shot.cropTL.minX) * shot.scale), "y": Double((cursor.y - shot.cropTL.minY) * shot.scale)],
        ]
        if let ax { input["ax"] = AXProbe.json(ax, origin: shot.cropTL.origin, scale: shot.scale) }

        onStatus?("Locating\u{2026}")
        let resp: [String: Any]
        do {
            resp = try await stage("locate", localTrace) { try await self.post("api/locate", ["input": input], timeout: 10) }
        } catch {
            // Fallback: no label, but still read the whole crop; the failure stays visible.
            let msg = (error as? PipeError)?.message ?? error.localizedDescription
            show(.error("Locate failed (\(msg)). Reading the whole crop.", tip: localTrace + " \u{00B7} " + timings.joined(separator: " ")), hold: 8)
            await finish(shot, box: nil, label: "Capture", kind: "capture", trace: localTrace, tip: localTrace, keepChip: true)
            return
        }
        let trace = ((resp["trace"] as? [String: Any])?["id"] as? String) ?? localTrace
        let result = Located.parse(resp["result"] as? [String: Any])
        let ask = resp["ask"] as? String

        if let ask, !ask.isEmpty {
            askUser(ask, result: result, shot: shot, trace: trace)
        } else if let result {
            await finish(shot, box: result.box, label: result.label, kind: result.kind, trace: trace, tip: tip(trace: trace, result))
        } else {
            askUser("Which one?", result: nil, shot: shot, trace: trace)   // never a silent miss
        }
    }

    private func askUser(_ prompt: String, result: Located?, shot: Shot, trace: String) {
        var cands = result?.candidates ?? []
        if cands.isEmpty, let r = result { cands = [r] }
        var picks: [Pick] = cands.prefix(2).map { .box($0) }
        if picks.count < 2 { picks.append(.whole) }
        if picks.count < 2 { picks.append(.cancel) }
        let labels = picks.map { p -> String in
            switch p {
            case .box(let l): return l.label.isEmpty ? l.kind.capitalized : l.label
            case .whole: return "Whole crop"
            case .cancel: return "Cancel"
            }
        }
        pending = Pending(shot: shot, trace: trace, picks: picks)
        show(.ask(prompt: prompt, options: labels, tip: "trace \(trace) \u{00B7} " + timings.joined(separator: " ")), hold: 25)
        onStatus?(nil)
    }

    /// extract -> lift -> tray chip. `box` is in image pixels.
    private func finish(_ shot: Shot, box: CGRect?, label: String, kind: String, trace: String, tip: String, keepChip: Bool = false) async {
        let myGen = gen
        if !keepChip { show(.label(kind: kind, text: label, tip: tip, working: "Reading\u{2026}"), hold: 12) }
        let img = Self.cropped(shot.image, to: box) ?? shot.image
        guard let url = Self.dataURL(img) else { show(.error("Crop too large to send", tip: tip), hold: 6); return }
        onStatus?("Reading\u{2026}")
        do {
            let ext = try await stage("extract", trace) {
                try await self.post("api/extract", ["image": url, "hint": "option-hold: \(kind) \(label)".prefix(200).description], timeout: 30)
            }
            guard let entity = ext["entity"] else { throw PipeError(message: "no entity in response") }
            if !keepChip { show(.label(kind: kind, text: label, tip: tip, working: "Lifting\u{2026}"), hold: 12) }
            onStatus?("Lifting\u{2026}")
            let lift = try await stage("lift", trace) { try await self.post("api/lift", ["entity": entity], timeout: 30) }
            guard let link = lift["url"] as? String else { throw PipeError(message: "no url in response") }
            let e = entity as? [String: Any]
            let title = (e?["title"] as? String) ?? (e?["name"] as? String) ?? (label.isEmpty ? "Capture" : label)
            let k = (e?["kind"] as? String) ?? (e?["type"] as? String) ?? kind
            store?.addLocal(TrayItem(id: "local-\((lift["id"] as? String) ?? UUID().uuidString)", title: title, kind: k, url: link, createdAt: ""))
            plog.info("done trace=\(trace, privacy: .public) \(self.timings.joined(separator: " "), privacy: .public)")
            if myGen == gen { show(.label(kind: kind, text: label, tip: tip + " \u{00B7} " + timings.joined(separator: " "), working: "Lifted"), hold: 3) }
            onStatus?(nil)
        } catch {
            let msg = (error as? PipeError)?.message ?? error.localizedDescription
            plog.error("failed trace=\(trace, privacy: .public) \(msg, privacy: .public)")
            show(.error("\(label.isEmpty ? "Capture" : label): \(msg)", tip: tip + " \u{00B7} " + timings.joined(separator: " ")), hold: 10)
            onStatus?("Lift failed")
        }
    }

    private func tip(trace: String, _ l: Located) -> String {
        "trace \(trace) \u{00B7} \(l.source) \(Int(l.confidence * 100))% \u{00B7} " + timings.joined(separator: " ")
    }

    private func show(_ s: LocateState, hold: TimeInterval) {
        store?.locate = s
        onPeek?(hold)
        let g = gen
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(hold * 1_000_000_000))
            if g == gen, store?.locate == s { store?.locate = nil }
        }
    }

    // MARK: Stage timing (os_signpost + log + tooltip text)

    private func stage<T>(_ name: StaticString, _ trace: String, _ body: () async throws -> T) async rethrows -> T {
        let sid = signposter.makeSignpostID()
        let st = signposter.beginInterval(name, id: sid, "trace=\(trace, privacy: .public)")
        let t0 = DispatchTime.now().uptimeNanoseconds
        defer {
            let ms = Int((DispatchTime.now().uptimeNanoseconds - t0) / 1_000_000)
            signposter.endInterval(name, st, "ms=\(ms)")
            timings.append("\(name) \(ms)ms")
            plog.info("stage \("\(name)", privacy: .public) \(ms)ms trace=\(trace, privacy: .public)")
        }
        return try await body()
    }

    // MARK: Capture

    private func capture(screen: NSScreen, primaryH: CGFloat, cursor: CGPoint, ax: AxNodeSnap?) async throws -> Shot {
        let content = try await SCShareableContent.current
        let id = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID
        guard let display = content.displays.first(where: { $0.displayID == id }) ?? content.displays.first else {
            throw PipeError(message: "display not found")
        }
        let f = screen.frame
        let screenTL = CGRect(x: f.minX, y: primaryH - f.maxY, width: f.width, height: f.height)
        var crop = CGRect(x: cursor.x - 260, y: cursor.y - 180, width: 520, height: 360)
        if let a = ax?.frame, a.width >= 40, a.height >= 30, a.width <= 1600, a.height <= 1200,
           a.insetBy(dx: -4, dy: -4).contains(cursor) {
            crop = a.insetBy(dx: -8, dy: -8)                       // AX frame is sane: use it
        }
        crop = crop.intersection(screenTL)
        if crop.isNull || crop.width < 8 || crop.height < 8 { throw PipeError(message: "crop outside display") }
        let scale = screen.backingScaleFactor
        let cfg = SCStreamConfiguration()
        cfg.sourceRect = crop.offsetBy(dx: -screenTL.minX, dy: -screenTL.minY)
        cfg.width = max(1, Int((crop.width * scale).rounded()))
        cfg.height = max(1, Int((crop.height * scale).rounded()))
        cfg.showsCursor = false
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let img = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: cfg)
        return Shot(image: img, cropTL: crop, scale: CGFloat(img.width) / crop.width)
    }

    nonisolated static func cropped(_ img: CGImage, to box: CGRect?) -> CGImage? {
        guard let box, box.width >= 24, box.height >= 24 else { return nil }
        let full = CGRect(x: 0, y: 0, width: img.width, height: img.height)
        let r = box.insetBy(dx: -8, dy: -8).intersection(full).integral
        if r.isNull || r.width < 24 || r.height < 24 || r.width * r.height > full.width * full.height * 0.95 { return nil }
        return img.cropping(to: r)
    }

    nonisolated static func dataURL(_ img: CGImage) -> String? {
        let rep = NSBitmapImageRep(cgImage: img)
        let limit = 11_000_000
        if let png = rep.representation(using: .png, properties: [:]) {
            let s = "data:image/png;base64," + png.base64EncodedString()
            if s.utf8.count < limit { return s }
        }
        if let jpg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.8]) {
            let s = "data:image/jpeg;base64," + jpg.base64EncodedString()
            if s.utf8.count < limit { return s }
        }
        return nil
    }

    // MARK: HTTP

    private func post(_ path: String, _ body: [String: Any], timeout: TimeInterval) async throws -> [String: Any] {
        guard JSONSerialization.isValidJSONObject(body),
              let data = try? JSONSerialization.data(withJSONObject: body) else { throw PipeError(message: "bad request body") }
        var req = URLRequest(url: Endpoints.api.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = data
        req.timeoutInterval = timeout
        let d: Data, r: URLResponse
        do { (d, r) = try await URLSession.shared.data(for: req) }
        catch { throw PipeError(message: (error as NSError).code == NSURLErrorTimedOut ? "\(path) timed out" : "server unreachable") }
        let obj = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any]
        guard let code = (r as? HTTPURLResponse)?.statusCode, (200..<300).contains(code) else {
            let detail = ((obj?["error"] as? String) ?? (obj?["message"] as? String) ?? "").prefix(120)
            throw PipeError(message: "\(path) HTTP \((r as? HTTPURLResponse)?.statusCode ?? 0) \(detail)")
        }
        guard let obj else { throw PipeError(message: "\(path) returned non-JSON") }
        return obj
    }
}
