import XCTest
@testable import MealRhythm

final class KeychainStoreTests:XCTestCase {
    func testSessionRoundTripInSystemKeychain() throws {
        let previous=KeychainStore.load()
        defer { if let previous {try? KeychainStore.save(previous)} else {KeychainStore.clear()} }
        let session=Session(accessToken:"test-access",refreshToken:"test-refresh",expiresIn:900,userId:"keychain-test")
        try KeychainStore.save(session)
        XCTAssertEqual(KeychainStore.load()?.userId,session.userId)
        XCTAssertEqual(KeychainStore.load()?.refreshToken,session.refreshToken)
        KeychainStore.clear()
        XCTAssertNil(KeychainStore.load())
    }
}
