import XCTest

final class MealFlowTests:XCTestCase {
    @MainActor func testOnboardingManualMealAndToday() throws {
        continueAfterFailure=false
        let app=XCUIApplication()
        app.launchEnvironment["MEALRHYTHM_UI_TEST_WAKE"]=String(Date().addingTimeInterval(-3600).timeIntervalSince1970)
        app.launchEnvironment["MEALRHYTHM_UI_TEST_SLEEP"]=String(Date().addingTimeInterval(12*3600).timeIntervalSince1970)
        app.launch()
        if app.buttons["guestLogin"].waitForExistence(timeout:5) {
            app.buttons["guestLogin"].tap()
            let next=app.buttons["onboardingNext"];XCTAssertTrue(next.waitForExistence(timeout:30),app.debugDescription)
            for _ in 0..<5 {next.tap()}
        }
        let record=app.tabBars.buttons["记一餐"];XCTAssertTrue(record.waitForExistence(timeout:20));record.tap()
        let manual=app.buttons["manualMeal"];app.swipeUp();XCTAssertTrue(manual.waitForExistence(timeout:5));manual.tap()
        let rice=app.buttons["food-rice"];XCTAssertTrue(rice.waitForExistence(timeout:10));rice.tap()
        let save=app.buttons["saveMeal"];for _ in 0..<5 {if save.isHittable {break};app.swipeUp()};save.tap()
        let notice=app.alerts.buttons["知道了"];if notice.waitForExistence(timeout:10) {notice.tap()}
        for _ in 0..<6 {if app.staticTexts["这一餐"].exists {break};app.swipeUp()}
        XCTAssertTrue(app.staticTexts["这一餐"].waitForExistence(timeout:10),app.debugDescription)
    }
}
