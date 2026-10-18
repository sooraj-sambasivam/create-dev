import Foundation
import SwiftUI
import AppKit

struct TrayItem: Identifiable, Equatable {
    let id: String
    var title: String
    var kind: String
    var url: String
    var createdAt: String
}

private struct TrayResponse: Decodable {
    struct Item: Decodable {
        let id: String
        let title: String?
        let kind: String?
        let url: String?
        let createdAt: FlexString?
    }
    let items: [Item]
}

/// createdAt may arrive as an ISO string or a number; accept both.
private struct FlexString: Decodable {
    let value: String
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self) { value = s }
        else if let d = try? c.decode(Double.self) { value = String(d) }
        else { value = "" }
    }
}

/// What the Option-hold pipeline is showing near the notch.
enum LocateState: Equatable {
    case label(kind: String, text: String, tip: String, working: String?)
    case ask(prompt: String, options: [String], tip: String)
    case error(String, tip: String)
}

/// Shared motion: one spring everywhere, matched to the web app (response 0.35, damping 0.8).
enum Motion {
    static var reduced: Bool { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }
    static var spring: Animation { reduced ? .easeOut(duration: 0.12) : .spring(response: 0.35, dampingFraction: 0.8) }
    static var hover: Animation { reduced ? .linear(duration: 0.01) : .easeOut(duration: 0.14) }
}

enum Endpoints {
    static let api = URL(string: "http://localhost:3001")!
    static let web = URL(string: "http://localhost:5175")!
}

@MainActor
final class TrayStore: ObservableObject {
    @Published private(set) var items: [TrayItem] = []
    @Published private(set) var online = false
    @Published var status: String? = nil
    @Published var locate: LocateState? = nil
    /// Index of the "Which one?" button pressed.
    var onPick: ((Int) -> Void)?
    /// Fired with the count of newly seen items (not on the first successful poll).
    var onNewItems: ((Int) -> Void)?

    private var seen = Set<String>()
    /// Ids dismissed locally; hidden from polls until the server stops returning them.
    private var dismissed = Set<String>()
    private var primed = false
    private var timer: Timer?
    private var inFlight = false
    private let session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 1.2
        c.timeoutIntervalForResource = 1.5
        return URLSession(configuration: c)
    }()

    func start() {
        poll()
        timer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.poll() }
        }
    }

    func addLocal(_ item: TrayItem) {
        guard !seen.contains(item.id) else { return }
        seen.insert(item.id)
        withAnimation(Motion.spring) { items.insert(item, at: 0) }
        onNewItems?(1)
    }

    /// Optimistic remove, then DELETE /api/tray/:id. A failed DELETE leaves it hidden until the next
    /// poll that still lists it after the request settled (we then un-hide it).
    func dismiss(_ item: TrayItem) {
        dismissed.insert(item.id)
        withAnimation(Motion.spring) { items.removeAll { $0.id == item.id } }
        guard !item.id.hasPrefix("local-") else { return }
        let id = item.id
        Task { @MainActor in
            var req = URLRequest(url: Endpoints.api.appendingPathComponent("api/tray").appendingPathComponent(id))
            req.httpMethod = "DELETE"
            let ok = (try? await session.data(for: req)).map { ($0.1 as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) || $0.statusCode == 404 } ?? false } ?? false
            if !ok { dismissed.remove(id) }   // next poll restores it
        }
    }

    private func poll() {
        guard !inFlight else { return }
        inFlight = true
        Task { @MainActor in
            defer { inFlight = false }
            let result = await fetch()
            switch result {
            case .empty: online = true; apply([])
            case .items(let list): online = true; apply(list)
            case .failed: online = false   // keep what we have; server may be restarting
            }
        }
    }

    private enum Fetch { case items([TrayItem]), empty, failed }

    private func fetch() async -> Fetch {
        var req = URLRequest(url: Endpoints.api.appendingPathComponent("api/tray"))
        req.cachePolicy = .reloadIgnoringLocalCacheData
        do {
            let (data, resp) = try await session.data(for: req)
            guard let http = resp as? HTTPURLResponse else { return .failed }
            if http.statusCode == 404 { return .empty }          // route not mounted yet
            guard (200..<300).contains(http.statusCode) else { return .failed }
            let decoded = try JSONDecoder().decode(TrayResponse.self, from: data)
            let list = decoded.items.map {
                TrayItem(id: $0.id, title: $0.title ?? "Untitled", kind: $0.kind ?? "item",
                         url: $0.url ?? Endpoints.web.absoluteString, createdAt: $0.createdAt?.value ?? "")
            }
            return .items(list)
        } catch {
            return .failed
        }
    }

    private func apply(_ incoming: [TrayItem]) {
        dismissed.formIntersection(Set(incoming.map(\.id)))   // forget ids the server has dropped
        let incoming = incoming.filter { !dismissed.contains($0.id) }
        let local = items.filter { l in l.id.hasPrefix("local-") && !incoming.contains { $0.url == l.url } }
        // Newest first; server order is oldest-first by contract, so reverse.
        let ordered = incoming.reversed() + local
        let fresh = ordered.filter { !seen.contains($0.id) }
        guard ordered != items else { primed = true; return }
        withAnimation(Motion.spring) { items = Array(ordered) }
        fresh.forEach { seen.insert($0.id) }
        if primed && !fresh.isEmpty { onNewItems?(fresh.count) }
        primed = true
    }
}
