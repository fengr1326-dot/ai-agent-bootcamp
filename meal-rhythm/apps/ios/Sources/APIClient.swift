import Foundation

struct APIError: Error, LocalizedError, Sendable {
    let status: Int; let code: String; let message: String
    var errorDescription: String? { message }
    var retryable: Bool { status == 0 || status == 429 || status >= 500 }
}
@MainActor
final class APIClient {
    let baseURL: URL
    var session: Session?
    private let transport: URLSession
    private var refreshing: Task<Session, Error>?
    init(baseURL: URL, transport: URLSession = .shared, session: Session? = nil) { self.baseURL=baseURL; self.transport=transport; self.session=session }
    func data<T: Encodable>(_ value: T) throws -> Data { try JSONEncoder().encode(value) }
    func request<T: Decodable & Sendable>(_ operation: APIOperation, params: [String: String] = [:], body: Data? = nil, key: String = UUID().uuidString) async throws -> T {
        let raw = try await raw(operation, params:params, body:body, key:key)
        return try JSONDecoder().decode(Envelope<T>.self,from:raw).data
    }
    func raw(_ operation: APIOperation, params: [String: String] = [:], body: Data? = nil, key: String = UUID().uuidString, retry: Bool = true) async throws -> Data {
        var path=operation.path
        for (name,value) in params { path=path.replacingOccurrences(of:"{\(name)}",with:value.addingPercentEncoding(withAllowedCharacters:.urlPathAllowed.subtracting(CharacterSet(charactersIn:"/?#"))) ?? value) }
        guard !path.contains("{"), let url=URL(string:path,relativeTo:baseURL)?.absoluteURL else { throw APIError(status:0,code:"INVALID_URL",message:"服务地址无效") }
        #if !DEBUG
        guard url.scheme == "https" else { throw APIError(status:400,code:"HTTPS_REQUIRED",message:"正式版本需要 HTTPS 服务") }
        #endif
        var request=URLRequest(url:url); request.httpMethod=operation.method; request.httpBody=body; request.timeoutInterval=25
        if body != nil { request.setValue("application/json",forHTTPHeaderField:"Content-Type") }
        if !operation.isPublic { if let session { request.setValue("Bearer \(session.accessToken)",forHTTPHeaderField:"Authorization") }; if operation.method != "GET" { request.setValue(key,forHTTPHeaderField:"Idempotency-Key") } }
        let responseData: Data; let response: URLResponse
        do { (responseData,response)=try await transport.data(for:request) }
        catch { throw APIError(status:0,code:"NETWORK",message:"暂时无法连接，记录会保存在本机。") }
        let status=(response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 && retry && !operation.isPublic && session != nil {
            if refreshing == nil {
                let token=session!.refreshToken
                refreshing=Task { [self] in try await requestSessionRefresh(token) }
            }
            do { session=try await refreshing!.value; refreshing=nil; try KeychainStore.save(session!); return try await raw(operation,params:params,body:body,key:key,retry:false) }
            catch { refreshing=nil; throw error }
        }
        guard (200..<300).contains(status) else {
            let error=(try? JSONSerialization.jsonObject(with:responseData)) as? [String:Any]
            throw APIError(status:status,code:error?["code"] as? String ?? "HTTP_ERROR",message:error?["message"] as? String ?? "服务暂时不可用")
        }
        return responseData
    }
    private func requestSessionRefresh(_ token: String) async throws -> Session {
        try await request(.refresh,body:data(["refreshToken":token]))
    }
    func upload(_ bytes: Data, ticket: UploadTicket) async throws {
        guard let url=URL(string:ticket.url) else { throw APIError(status:400,code:"UPLOAD_URL",message:"照片上传地址无效") }
        var request=URLRequest(url:url); request.httpMethod="PUT"; request.setValue("image/jpeg",forHTTPHeaderField:"Content-Type"); request.timeoutInterval=30
        let (_,response)=try await transport.upload(for:request,from:bytes)
        guard let http=response as? HTTPURLResponse,(200..<300).contains(http.statusCode) else { throw APIError(status:503,code:"UPLOAD_FAILED",message:"照片上传失败，请重试") }
    }
}
