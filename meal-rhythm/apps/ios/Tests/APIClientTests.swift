import XCTest
@testable import MealRhythm

final class StubHandlerBox:@unchecked Sendable {
    private let lock=NSLock()
    private var callback: (@Sendable(URLRequest)throws->(Int,Data))?
    func configure(_ handler:@escaping @Sendable(URLRequest)throws->(Int,Data)) {lock.lock();defer {lock.unlock()};callback=handler}
    func response(to request:URLRequest)throws->(Int,Data) {
        lock.lock();let handler=callback;lock.unlock()
        guard let handler else {throw URLError(.unknown)}
        return try handler(request)
    }
}
final class StubProtocol:URLProtocol,@unchecked Sendable {
    // Serial test target; the box also protects URLSession callback-thread access.
    private static let handlers=StubHandlerBox()
    static func configure(_ handler:@escaping @Sendable(URLRequest)throws->(Int,Data)) {handlers.configure(handler)}
    override class func canInit(with request:URLRequest)->Bool {true}
    override class func canonicalRequest(for request:URLRequest)->URLRequest {request}
    override func startLoading() {
        do {let (status,data)=try Self.handlers.response(to:request);let response=HTTPURLResponse(url:request.url!,statusCode:status,httpVersion:nil,headerFields:["Content-Type":"application/json"])!;client?.urlProtocol(self,didReceive:response,cacheStoragePolicy:.notAllowed);client?.urlProtocol(self,didLoad:data);client?.urlProtocolDidFinishLoading(self)} catch {client?.urlProtocol(self,didFailWithError:error)}
    }
    override func stopLoading() {}
}
@MainActor final class APIClientTests:XCTestCase {
    private func client()->APIClient {
        let config=URLSessionConfiguration.ephemeral;config.protocolClasses=[StubProtocol.self]
        return APIClient(baseURL:URL(string:"https://example.test")!,transport:URLSession(configuration:config),session:Session(accessToken:"access",refreshToken:"refresh",expiresIn:900,userId:"user-a"))
    }
    func testPrivateMutationCarriesAuthAndStableIdempotencyKey() async throws {
        StubProtocol.configure {request in
            XCTAssertEqual(request.httpMethod,"DELETE");XCTAssertEqual(request.url?.path,"/v1/meals/meal-a")
            XCTAssertNil(request.value(forHTTPHeaderField:"Content-Type"))
            XCTAssertEqual(request.value(forHTTPHeaderField:"Authorization"),"Bearer access")
            XCTAssertEqual(request.value(forHTTPHeaderField:"Idempotency-Key"),"stable-key")
            return (200,try JSONSerialization.data(withJSONObject:["data":["deleted":true],"requestId":"test"]))
        }
        let result:Ack=try await client().request(.deleteMeal,params:["id":"meal-a"],key:"stable-key")
        XCTAssertEqual(result.deleted,true)
    }
    func testServerConflictRemainsNonRetryable() async {
        StubProtocol.configure {_ in (409,try JSONSerialization.data(withJSONObject:["code":"REVISION_CONFLICT","message":"请刷新后重试","requestId":"test"]))}
        do {let _:Ack=try await client().request(.deleteMeal,params:["id":"a"]);XCTFail("Expected conflict")}
        catch let error as APIError {XCTAssertEqual(error.code,"REVISION_CONFLICT");XCTAssertFalse(error.retryable)} catch {XCTFail("Unexpected error")}
    }
    func testNetworkFailurePreservesQueuedWriteForRetry() async throws {
        StubProtocol.configure {_ in throw URLError(.notConnectedToInternet)}
        let local=try LocalStore(path:":memory:");let store=AppStore(api:client(),local:local);store.loggedIn=true
        let saved=await store.write(.createMeal,body:Empty())
        XCTAssertTrue(saved);XCTAssertEqual(store.pending.count,1);XCTAssertNil(store.pending.first?.failure)
        let key=try XCTUnwrap(store.pending.first?.id)
        StubProtocol.configure {request in XCTAssertEqual(request.value(forHTTPHeaderField:"Idempotency-Key"),key);return (200,try JSONSerialization.data(withJSONObject:["data":["saved":true],"requestId":"test"]))}
        await store.sync();XCTAssertTrue(store.pending.isEmpty)
    }
    func testOldAmbiguousWriteIsNotAutomaticallyReplayed() async throws {
        StubProtocol.configure {_ in XCTFail("Expired writes must not be sent");throw URLError(.cancelled)}
        let local=try LocalStore(path:":memory:")
        try local.enqueue(PendingWrite(id:"expired-key",userId:"user-a",operation:"createMeal",params:Data("{}".utf8),body:Data("{}".utf8),createdAt:Date().addingTimeInterval(-25*3600).timeIntervalSince1970))
        let store=AppStore(api:client(),local:local);store.loggedIn=true;await store.sync()
        XCTAssertEqual(store.pending.count,1);XCTAssertNotNil(store.pending.first?.failure)
    }
}
