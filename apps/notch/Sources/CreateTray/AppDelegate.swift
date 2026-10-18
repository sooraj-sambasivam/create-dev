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
        capture.onStatus = { [weak self] text in
            self?.store.status = text
            if text != nil { self?.peek(seconds: 4) }
        }

        // Hover + Option-hold are polled: no event-tap, no Accessibility permission needed.
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
        let keep = NSRect(x: cx - 230, y: f.maxY - 280, width: 460, height: 280)

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
