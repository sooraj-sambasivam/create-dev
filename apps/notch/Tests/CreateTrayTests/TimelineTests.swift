import XCTest
@testable import CreateTray

final class TimelineTests: XCTestCase {
    func testRingAtAndNearest() {
        var r = TimedRing<Int>(windowSec: 15)
        for i in 0..<10 { r.append(Double(i), i) }
        XCTAssertNil(r.at(-1))
        XCTAssertEqual(r.at(3.4)?.v, 3)
        XCTAssertEqual(r.nearest(3.4)?.v, 3)
        XCTAssertEqual(r.nearest(3.6)?.v, 4)
        XCTAssertEqual(r.nearest(99)?.v, 9)
        XCTAssertEqual(r.nearest(-5)?.v, 0)
    }

    func testRingForgetsOldSamples() {
        var r = TimedRing<Int>(windowSec: 2)
        for i in 0..<100 { r.append(Double(i), i) }
        XCTAssertEqual(r.count, 3)          // t = 97, 98, 99
        XCTAssertEqual(r.nearest(0)?.v, 97)
        XCTAssertEqual(r.between(98, 99).map(\.v), [98, 99])
    }

    func testOutOfOrderStampsAreClamped() {
        var r = TimedRing<Int>(windowSec: 15)
        r.append(5, 1); r.append(4, 2)
        XCTAssertEqual(r.at(5)?.v, 2)
        XCTAssertEqual(r.items.map(\.t), [5, 5])
    }

    func testDeixis() {
        XCTAssertTrue(Deixis.isDeictic("This"))
        XCTAssertTrue(Deixis.isDeictic("here,"))
        XCTAssertFalse(Deixis.isDeictic("table"))
    }
}
