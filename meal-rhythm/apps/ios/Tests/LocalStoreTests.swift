import XCTest
@testable import MealRhythm

@MainActor final class LocalStoreTests:XCTestCase {
    func testQueueSurvivesDatabaseReopenAndIsAccountScoped() throws {
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        defer {try? FileManager.default.removeItem(at:directory)}
        let path=directory.appendingPathComponent("test.sqlite").path
        let first=try LocalStore(path:path)
        let write=PendingWrite(id:"same-key",userId:"user-a",operation:"createMeal",params:Data("{}".utf8),body:Data("{}".utf8),createdAt:1)
        try first.enqueue(write)
        let reopened=try LocalStore(path:path)
        XCTAssertEqual(try reopened.pending(userId:"user-a").map(\.id),["same-key"])
        XCTAssertTrue(try reopened.pending(userId:"user-b").isEmpty)
        try reopened.fail(write.id,message:"需要人工核对")
        XCTAssertEqual(try reopened.pending(userId:"user-a").first?.failure,"需要人工核对")
        try reopened.remove(write.id);XCTAssertTrue(try first.pending(userId:"user-a").isEmpty)
    }
    func testPhotoDraftPersistsAndClearErasesCache() throws {
        let local=try LocalStore(path:":memory:")
        let draft=PhotoDraft(jpeg:Data([1,2,3]),text:"")
        try local.cache(draft,key:"user-a/draft")
        XCTAssertEqual(try local.cached(PhotoDraft.self,key:"user-a/draft")?.jpeg,Data([1,2,3]))
        try local.clear();XCTAssertNil(try local.cached(PhotoDraft.self,key:"user-a/draft"))
    }
}
