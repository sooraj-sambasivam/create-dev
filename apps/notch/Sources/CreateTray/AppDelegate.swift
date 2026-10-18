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
    private var tick: Timer?
    private let capture = CaptureController()
    private var wheelMonitor: Any?

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

        // Hover + Option-hold are polled (no event-tap). Accessibility is used only for the AX probe at the cursor.
        tick = Timer.scheduledTimer(withTimeInterval: 0.06, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.onTick() }
        }
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
    }

    private func setExpanded(_ on: Bool) {
        guard on != expanded, let notch else { return }
        expanded = on
        Task { if on { await notch.expand() } else { await notch.compact() } }
    }

    private func onTick() {
        guard let screen = NSScreen.screens.first else { return }
        let m = NSEvent.mouseLocation
        let f = screen.frame
        let cx = f.midX
        // Trigger zone: the notch/pill area. Keep-open zone: the expanded tray.
        let trigger = NSRect(x: cx - 140, y: f.maxY - 40, width: 280, height: 40)
        let keep = NSRect(x: cx - 300, y: f.maxY - 360, width: 600, height: 360)

        if expanded {
            if keep.contains(m) || Date() < pinnedUntil { leftAt = nil }
            else if let l = leftAt { if Date().timeIntervalSince(l) > 0.35 { leftAt = nil; setExpanded(false) } }
            else { leftAt = Date() }
        } else if trigger.contains(m) {
            setExpanded(true)
        }
        capture.tick(screen: screen, mouse: m)
    }
}
