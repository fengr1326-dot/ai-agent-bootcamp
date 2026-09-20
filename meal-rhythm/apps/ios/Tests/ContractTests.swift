import XCTest
@testable import MealRhythm

final class ContractTests:XCTestCase {
    private func fixture<T:Decodable & Sendable>(_ name:String,_ type:T.Type) throws -> T {
        let bundle=Bundle(for:ContractTests.self)
        let url=try XCTUnwrap(bundle.url(forResource:name,withExtension:"json",subdirectory:"Fixtures") ?? bundle.url(forResource:name,withExtension:"json"))
        return try JSONDecoder().decode(Envelope<T>.self,from:Data(contentsOf:url)).data
    }
    func testDecodeRealDayResponse() throws {
        let day=try fixture("day",Day.self)
        XCTAssertEqual(day.date,"2026-09-17");XCTAssertEqual(day.recommendations.count,3)
        XCTAssertNil(day.context.trainingAt);XCTAssertNil(day.safety.message)
        XCTAssertEqual(day.meals.count,1);XCTAssertEqual(day.nutrition.mealCount,1)
    }
    func testDecodeAllClientResponses() throws {
        XCTAssertEqual(try fixture("profile",Profile.self).direction,.feelGood)
        XCTAssertEqual(try fixture("foods",Catalog.self).items.count,12)
        XCTAssertEqual(try fixture("trends",Trends.self).days.count,7)
        XCTAssertEqual(try fixture("recognition",Recognition.self).status,"ready")
        XCTAssertEqual(try fixture("meal",Meal.self).revision,1)
    }
    func testCreateOmitsRevisionAndDatesRoundTrip() throws {
        let date=Date(timeIntervalSince1970:1789617600)
        let input=MealInput(title:"午餐",eatenAt:Timestamp.string(date),status:"eaten",portion:"normal",items:[MealItem(foodId:"rice",grams:150)],confidence:"medium")
        let object=try XCTUnwrap(JSONSerialization.jsonObject(with:JSONEncoder().encode(input)) as? [String:Any])
        XCTAssertNil(object["revision"])
        XCTAssertEqual(try XCTUnwrap(Timestamp.date(input.eatenAt)).timeIntervalSince1970,date.timeIntervalSince1970,accuracy:0.001)
        XCTAssertNotNil(Timestamp.date("2026-09-17T12:00:00+08:00"))
    }
}
