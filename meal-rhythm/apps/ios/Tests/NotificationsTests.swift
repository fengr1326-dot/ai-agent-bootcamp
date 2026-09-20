import XCTest
@testable import MealRhythm

final class NotificationsTests:XCTestCase {
    func testReplacementOnlyCancelsMealWindowIdentifiers() {
        XCTAssertEqual(Notifications.windowIdentifiers(["window-a","other","window-b","prewindow-c"]),["window-a","window-b"])
        XCTAssertEqual(Notifications.windowIdentifiers([]),[])
    }
}
