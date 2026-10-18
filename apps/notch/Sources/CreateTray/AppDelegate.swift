import AppKit
import SwiftUI
import DynamicNotchKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let store = TrayStore()
    private var notch: DynamicNotch<TrayContent, CompactLeading, CompactTrailing>?
    private var statusItem: NSStatusItem?
    private var expanded = false
    private var pinnedUntil = Date.distantPast
    private var leftAt: Date?
    private let capture = CaptureController()
    private var wheelMonitor: Any?
    /// Pointer history for word-time binding (mach-clock stamps from the global mouseMoved monitor).
    private let pointer = PointerTimeline()
    private var monitors: [Any] = []
    private var closeCheck: DispatchWorkItem?
    private var optionIsDown = false
    private var flagsFallback: Timer?

    func applicationDidFinishLaunching(_ n: Notification) {
        setupStatusItem()
        let s = store
        notch = DynamicNotch(hoverBehavior: .all) {
            TrayContent(store: s)
        } compactLeading: {
            CompactLeading(store: s)
        } compactTrailing: {
            CompactTrailing(store: s)
        }
        notch?.transitionConfiguration = DynamicNotchTransitionConfiguration(
            openingAnimation: Motion.spring, closingAnimation: Motion.spring, conversionAnimation: Motion.spring, skipIntermediateHides: true)
        Task { await notch?.compact() }

        store.onNewItems = { [weak self] _ in self?.peek() }
        store.start()
        capture.store = store
        capture.pointer = pointer
        store.onPick = { [weak self] i in self?.capture.pick(i) }
        capture.onPeek = { [weak self] s in self?.peek(seconds: s) }
        AXProbe.ensureTrust(prompt: true)   // one-time Accessibility grant
        capture.onStatus = { [weak self] text in
            self?.store.status = text
            if text != nil { self?.peek(seconds: 4) }
        }

        // The card row scrolls left to right: a plain mouse wheel (vertical) is turned into horizontal scrolling.
        wheelMonitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { event in
            guard abs(event.scrollingDeltaY) > abs(event.scrollingDeltaX), let cg = event.cgEvent?.copy() else { return event }
            let dy = cg.getDoubleValueField(.scrollWheelEventPointDeltaAxis1)
            let fy = cg.getDoubleValueField(.scrollWheelEventFixedPtDeltaAxis1)
            let iy = cg.getIntegerValueField(.scrollWheelEventDeltaAxis1)
            cg.setDoubleValueField(.scrollWheelEventPointDeltaAxis2, value: dy)
            cg.setDoubleValueField(.scrollWheelEventFixedPtDeltaAxis2, value: fy)
            cg.setIntegerValueField(.scrollWheelEventDeltaAxis2, value: iy)
            cg.setDoubleValueField(.scrollWheelEventPointDeltaAxis1, value: 0)
            cg.setDoubleValueField(.scrollWheelEventFixedPtDeltaAxis1, value: 0)
            cg.setIntegerValueField(.scrollWheelEventDeltaAxis1, value: 0)
            return NSEvent(cgEvent: cg) ?? event
        }

        installMonitors()
    }

    // MARK: Pointer and Option events (no polling)

    /// Global mouseMoved/drag monitor (stamped with event.timestamp, ~120 Hz) feeds the pointer ring and the notch hover zone;
    /// flagsChanged tracks Option. Global key monitors need Accessibility; without it a 10 Hz flag check keeps Option-hold working.
    private func installMonitors() {
        let moves: NSEvent.EventTypeMask = [.mouseMoved, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged]
        if let g = NSEvent.addGlobalMonitorForEvents(matching: moves, handler: { [weak self] e in
            MainActor.assumeIsolated { self?.pointerMoved(e, at: NSEvent.mouseLocation) }
        }) { monitors.append(g) }
        if let l = NSEvent.addLocalMonitorForEvents(matching: moves, handler: { [weak self] e in
            MainActor.assumeIsolated {
                let p = e.window.map { $0.convertPoint(toScreen: e.locationInWindow) } ?? NSEvent.mouseLocation
                self?.pointerMoved(e, at: p)
            }
            return e
        }) { monitors.append(l) }
        if let g = NSEvent.addGlobalMonitorForEvents(matching: .flagsChanged, handler: { [weak self] e in
            MainActor.assumeIsolated { self?.flagsChanged(e.modifierFlags) }
        }) { monitors.append(g) }
        if let l = NSEvent.addLocalMonitorForEvents(matching: .flagsChanged, handler: { [weak self] e in
            MainActor.assumeIsolated { self?.flagsChanged(e.modifierFlags) }
            return e
        }) { monitors.append(l) }
        if !AXProbe.trusted {
            flagsFallback = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated { self?.flagsChanged(NSEvent.modifierFlags) }
            }
        }
    }

    private func flagsChanged(_ flags: NSEvent.ModifierFlags) {
        let down = flags.intersection(.deviceIndependentFlagsMask) == .option
        guard down != optionIsDown else { return }
        optionIsDown = down
        capture.optionChanged(down: down)
    }

    private func pointerMoved(_ event: NSEvent, at p: NSPoint) {
        pointer.ingest(event, at: p)
        guard let screen = NSScreen.screens.first else { return }
        let f = screen.frame
        let cx = f.midX
        // Trigger zone: the notch/pill area. Keep-open zone: the expanded tray.
        let trigger = NSRect(x: cx - 140, y: f.maxY - 40, width: 280, height: 40)
        let keep = NSRect(x: cx - 300, y: f.maxY - 360, width: 600, height: 360)
        if expanded {
            if keep.contains(p) { leftAt = nil }
            else if leftAt == nil { leftAt = Date(); scheduleCloseCheck(after: 0.35) }
        } else if trigger.contains(p) {
            setExpanded(true)
        }
    }

    private func scheduleCloseCheck(after delay: TimeInterval) {
        closeCheck?.cancel()
        let work = DispatchWorkItem { [weak self] in MainActor.assumeIsolated { self?.checkClose() } }
        closeCheck = work
        DispatchQueue.main.asyncAfter(deadline: .now() + max(0.02, delay), execute: work)
    }

    /// Close the tray once the pointer has been outside it for 0.35 s and no peek is pinning it open.
    private func checkClose() {
        guard expanded, let screen = NSScreen.screens.first else { return }
        let f = screen.frame
        let keep = NSRect(x: f.midX - 300, y: f.maxY - 360, width: 600, height: 360)
        let m = NSEvent.mouseLocation
        let pinLeft = pinnedUntil.timeIntervalSinceNow
        if keep.contains(m) { leftAt = nil; return }
        if pinLeft > 0 { scheduleCloseCheck(after: pinLeft); return }
        guard let l = leftAt else { leftAt = Date(); scheduleCloseCheck(after: 0.35); return }
        let waited = Date().timeIntervalSince(l)
        if waited >= 0.35 { leftAt = nil; setExpanded(false) } else { scheduleCloseCheck(after: 0.35 - waited) }
    }

    // MARK: Menu bar

    private func setupStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "tray.fill", accessibilityDescription: "Create Tray")
        let menu = NSMenu()
        menu.addItem(withTitle: "Open Create", action: #selector(openCreate), keyEquivalent: "").target = self
        menu.addItem(withTitle: "Show Tray", action: #selector(showTray), keyEquivalent: "").target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Create Tray", action: #selector(quit), keyEquivalent: "q").target = self
        item.menu = menu
        statusItem = item
    }
    @objc private func openCreate() { openURL(Endpoints.web.absoluteString) }
    @objc private func showTray() { peek(seconds: 5) }
    @objc private func quit() { NSApp.terminate(nil) }

    // MARK: Expand / compact

    private func peek(seconds: TimeInterval = 2.6) {
        pinnedUntil = Date().addingTimeInterval(seconds)
        setExpanded(true)
        scheduleCloseCheck(after: seconds)
    }

    private func setExpanded(_ on: Bool) {
        guard on != expanded, let notch else { return }
        expanded = on
        Task { if on { await notch.expand() } else { await notch.compact() } }
    }
}
