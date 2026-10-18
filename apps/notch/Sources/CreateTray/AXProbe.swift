import AppKit
import ApplicationServices

/// One accessibility element, frame in global points (top-left origin, same space as AX positions).
struct AxNodeSnap {
    var role: String
    var title: String?
    var value: String?
    var frame: CGRect
    var children: [AxNodeSnap] = []
}

/// AX capture at the cursor. Every call is bounded by a messaging timeout, a node budget and a deadline,
/// so a hung app can never stall the pipeline; failures return nil and the pipeline falls back to pixels.
enum AXProbe {
    static var trusted: Bool { AXIsProcessTrusted() }

    /// With prompt=true, macOS shows its Accessibility prompt when the app is not yet trusted.
    @discardableResult
    static func ensureTrust(prompt: Bool) -> Bool {
        AXIsProcessTrustedWithOptions(["AXTrustedCheckOptionPrompt": prompt] as CFDictionary)
    }

    static let maxDepth = 3
    static let maxChildren = 50
    private static let maxNodes = 300
    /// Containers worth lifting, nearest first.
    private static let strongRoles: Set<String> = ["AXTable", "AXOutline", "AXList", "AXGrid"]

    /// `point` is in global top-left coordinates. Returns the nearest table/list/group around it.
    static func probe(at point: CGPoint, deadline: TimeInterval = 0.25) -> AxNodeSnap? {
        let end = Date().addingTimeInterval(deadline)
        let system = AXUIElementCreateSystemWide()
        AXUIElementSetMessagingTimeout(system, 0.12)
        var hit: AXUIElement?
        guard AXUIElementCopyElementAtPosition(system, Float(point.x), Float(point.y), &hit) == .success,
              let hit else { return nil }
        var pid: pid_t = 0
        AXUIElementGetPid(hit, &pid)
        if pid == ProcessInfo.processInfo.processIdentifier { return nil }   // our own tray
        AXUIElementSetMessagingTimeout(hit, 0.12)

        var root = hit
        var firstGroup: AXUIElement?
        var cur: AXUIElement? = hit
        var strong: AXUIElement?
        for _ in 0..<14 {
            guard let e = cur, Date() < end else { break }
            let role = string(e, kAXRoleAttribute) ?? ""
            if strongRoles.contains(role) { strong = e; break }
            if role == "AXGroup", firstGroup == nil, let f = frame(of: e), f.width >= 80, f.height >= 60 { firstGroup = e }
            cur = element(e, kAXParentAttribute)
        }
        root = strong ?? firstGroup ?? hit
        var budget = maxNodes
        return collect(root, depth: 0, budget: &budget, end: end)
    }

    private static func collect(_ e: AXUIElement, depth: Int, budget: inout Int, end: Date) -> AxNodeSnap? {
        guard let f = frame(of: e) else { return nil }
        budget -= 1
        var node = AxNodeSnap(role: string(e, kAXRoleAttribute) ?? "AXUnknown",
                              title: string(e, kAXTitleAttribute) ?? string(e, kAXDescriptionAttribute),
                              value: valueString(e), frame: f)
        guard depth < maxDepth, budget > 0, Date() < end,
              let kids = attr(e, kAXChildrenAttribute) as? [AXUIElement] else { return node }
        for k in kids.prefix(maxChildren) {
            if budget <= 0 || Date() >= end { break }
            if let c = collect(k, depth: depth + 1, budget: &budget, end: end) { node.children.append(c) }
        }
        return node
    }

    // MARK: Attribute helpers

    private static func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
        var v: CFTypeRef?
        return AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success ? v : nil
    }
    private static func string(_ e: AXUIElement, _ name: String) -> String? {
        guard let s = attr(e, name) as? String, !s.isEmpty else { return nil }
        return s
    }
    private static func valueString(_ e: AXUIElement) -> String? {
        let v = attr(e, kAXValueAttribute)
        if let s = v as? String, !s.isEmpty { return s }
        if let n = v as? NSNumber { return n.stringValue }
        return nil
    }
    private static func element(_ e: AXUIElement, _ name: String) -> AXUIElement? {
        guard let v = attr(e, name), CFGetTypeID(v) == AXUIElementGetTypeID() else { return nil }
        return (v as! AXUIElement)
    }
    static func frame(of e: AXUIElement) -> CGRect? {
        guard let p = attr(e, kAXPositionAttribute), CFGetTypeID(p) == AXValueGetTypeID(),
              let s = attr(e, kAXSizeAttribute), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
        var pt = CGPoint.zero, sz = CGSize.zero
        guard AXValueGetValue(p as! AXValue, .cgPoint, &pt), AXValueGetValue(s as! AXValue, .cgSize, &sz),
              pt.x.isFinite, pt.y.isFinite, sz.width.isFinite, sz.height.isFinite, sz.width >= 0, sz.height >= 0 else { return nil }
        return CGRect(origin: pt, size: sz)
    }

    // MARK: JSON for /api/locate (image-pixel space)

    static func json(_ n: AxNodeSnap, origin: CGPoint, scale: CGFloat, depth: Int = 0) -> [String: Any] {
        func c(_ v: CGFloat) -> Double { Double(min(max(v, -100_000), 100_000)) }
        var d: [String: Any] = [
            "role": String(n.role.prefix(80)),
            "frame": ["x": c((n.frame.minX - origin.x) * scale), "y": c((n.frame.minY - origin.y) * scale),
                      "w": c(n.frame.width * scale), "h": c(n.frame.height * scale)],
        ]
        if let t = n.title { d["title"] = String(t.prefix(500)) }
        if let v = n.value { d["value"] = String(v.prefix(2000)) }
        if depth < maxDepth, !n.children.isEmpty {
            d["children"] = n.children.prefix(maxChildren).map { json($0, origin: origin, scale: scale, depth: depth + 1) }
        }
        return d
    }
}
