import AppKit
import AVFoundation

/// The mach clock in seconds. AVAudioTime.hostTime, CACurrentMediaTime and mach_absolute_time share it,
/// so an audio buffer's capture time and a mouse event's time can be compared directly.
enum MachClock {
    static func now() -> Double { AVAudioTime.seconds(forHostTime: mach_absolute_time()) }
}

/// NSEvent.timestamp counts seconds since boot on the event system's clock. This maps it onto MachClock without assuming
/// the two agree: delivery only ever adds delay, so `now - timestamp` is never below the true offset, and the smallest value
/// seen (the least-delayed event) is the best estimate of it.
@MainActor
final class EventClock {
    private var offset: Double?
    func toMach(_ timestamp: TimeInterval) -> Double {
        let d = MachClock.now() - timestamp
        if offset == nil || d < offset! { offset = d }
        return timestamp + offset!
    }
}

/// A time-ordered ring. `windowSec` of history is kept; lookups are binary searches.
struct TimedRing<T> {
    struct Sample { var t: Double; var v: T }
    private(set) var items: [Sample] = []
    private var head = 0
    let windowSec: Double
    init(windowSec: Double) { self.windowSec = windowSec }

    var count: Int { items.count - head }
    var last: Sample? { count > 0 ? items[items.count - 1] : nil }

    mutating func append(_ t: Double, _ v: T) {
        // Out-of-order stamps are clamped to the newest, so the ring stays sorted.
        items.append(Sample(t: max(t, last?.t ?? t), v: v))
        let cutoff = items[items.count - 1].t - windowSec
        while head < items.count - 1, items[head].t < cutoff { head += 1 }
        if head > 512 { items.removeFirst(head); head = 0 }
    }

    /// Index (into `items`) of the last sample at or before t, or nil.
    private func index(atOrBefore t: Double) -> Int? {
        var lo = head, hi = items.count - 1, ans: Int?
        while lo <= hi {
            let m = (lo + hi) / 2
            if items[m].t <= t { ans = m; lo = m + 1 } else { hi = m - 1 }
        }
        return ans
    }

    func at(_ t: Double) -> Sample? { index(atOrBefore: t).map { items[$0] } }

    /// The sample closest in time to t (before or after).
    func nearest(_ t: Double) -> Sample? {
        guard count > 0 else { return nil }
        guard let i = index(atOrBefore: t) else { return items[head] }
        guard i + 1 < items.count else { return items[i] }
        return abs(items[i + 1].t - t) < abs(t - items[i].t) ? items[i + 1] : items[i]
    }

    func between(_ t0: Double, _ t1: Double) -> [Sample] {
        items[head...].filter { $0.t >= t0 && $0.t <= t1 }
    }
}

/// Pointer positions from the global mouseMoved monitor (event.timestamp on the mach clock, ~120 Hz), kept for 15 s.
@MainActor
final class PointerTimeline {
    let clock = EventClock()
    private(set) var ring = TimedRing<CGPoint>(windowSec: 15)

    func ingest(_ event: NSEvent, at point: CGPoint) {
        ring.append(clock.toMach(event.timestamp), point)
    }

    /// Where the pointer was when a word was said. A word is said over a short span, so the slowest moment within
    /// +/- 120 ms of its start is taken: the pointer dwelling on what "this" meant beats a sample mid-swipe.
    func position(forWordStart t: Double) -> CGPoint? {
        let near = ring.between(t - 0.12, t + 0.12)
        guard near.count > 1 else { return ring.nearest(t)?.v }
        var best = near[0], bestSpeed = Double.infinity
        for i in 1..<near.count {
            let dt = max(near[i].t - near[i - 1].t, 0.001)
            let speed = hypot(near[i].v.x - near[i - 1].v.x, near[i].v.y - near[i - 1].v.y) / dt
            if speed < bestSpeed { bestSpeed = speed; best = near[i] }
        }
        return best.v
    }
}

/// Words that name a thing on screen.
enum Deixis {
    static let words: Set<String> = ["this", "that", "these", "those", "here", "there", "it", "one"]
    static func isDeictic(_ w: String) -> Bool {
        words.contains(w.lowercased().trimmingCharacters(in: CharacterSet.letters.inverted.subtracting(CharacterSet(charactersIn: "'"))))
    }
}
