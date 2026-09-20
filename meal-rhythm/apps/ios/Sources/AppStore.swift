import Foundation
import Observation
import Network

struct PhotoDraft: Codable, Sendable {
    var jpeg: Data?; var text: String; var upload: UploadTicket?; var jobId: String?
    var uploadKey = UUID().uuidString; var jobKey = UUID().uuidString
    var createdAt = Date(); var consent = false
}

@MainActor @Observable
final class AppStore {
    let api: APIClient
    private let local: LocalStore
    private var monitor: NWPathMonitor?
    private var notificationResponder:NotificationResponder?
    private var syncing = false
    private var recognizing = false
    var loggedIn = false
    var loading = false
    var profile: Profile?
    var day: Day?
    var catalog: [Food] = []
    var trends: Trends?
    var pending: [PendingWrite] = []
    var message: String?
    var offline = false
    var draft: PhotoDraft?
    var recognition: Recognition?
    var recognitionProgress: String?
    var tab = 0

    init(api: APIClient, local: LocalStore) { self.api=api; self.local=local }
    private var user: String { api.session?.userId ?? "signed-out" }
    private func cacheKey(_ name: String) -> String { "\(user)/\(name)" }
    func start() async {
        notificationResponder=NotificationResponder(store:self)
        api.session=KeychainStore.load(); loggedIn=api.session != nil
        if loggedIn { await restore() }
        let watcher=NWPathMonitor()
        watcher.pathUpdateHandler = { [weak self] path in
            let connected = path.status == .satisfied
            Task { @MainActor [weak self] in
                guard let self else { return }; self.offline = !connected
                if connected && self.loggedIn { await self.sync(); await self.reload() }
            }
        }
        watcher.start(queue:DispatchQueue(label:"MealRhythm.network")); monitor=watcher
    }
    func signIn(_ operation: APIOperation, body: Data) async {
        loading=true; defer { loading=false }
        do { let session:Session=try await api.request(operation,body:body); try KeychainStore.save(session); api.session=session; loggedIn=true; await restore() }
        catch { message=error.localizedDescription }
    }
    private func restore() async {
        do {
            profile=try local.cached(Profile.self,key:cacheKey("profile"))
            day=try local.cached(Day.self,key:cacheKey("day"))
            catalog=try local.cached([Food].self,key:cacheKey("foods")) ?? []
            draft=try local.cached(PhotoDraft?.self,key:cacheKey("draft")) ?? nil
            pending=try local.pending(userId:user)
        } catch { message="本机缓存读取失败：\(error.localizedDescription)" }
        await sync(); await reload()
    }
    func reload() async {
        guard loggedIn else { return }
        do {
            let fetched:Profile?=try await api.request(.profile)
            profile=fetched
            if let fetched { try local.cache(fetched,key:cacheKey("profile")) }
            let foods:Catalog=try await api.request(.foods); catalog=foods.items; try local.cache(catalog,key:cacheKey("foods"))
            if fetched != nil {
                let result:Day=try await api.request(.day,params:["date":"today"])
                day=result; try local.cache(result,key:cacheKey("day"))
                trends=try await api.request(.trends)
                let reminders:[Reminder]=try await api.request(.notifications)
                try await Notifications.replace(reminders)
            }
            offline=false
        } catch { if let e=error as? APIError,e.retryable { offline=true }; message=error.localizedDescription }
    }
    /// Persist before sending. A failed transport never loses the user's confirmed input.
    @discardableResult
    func write<T: Encodable>(_ operation: APIOperation, params: [String:String] = [:], body:T) async -> Bool {
        do {
            let item=PendingWrite(id:UUID().uuidString,userId:user,operation:operation.rawValue,params:try api.data(params),body:try api.data(body),createdAt:Date().timeIntervalSince1970)
            try local.enqueue(item); pending=try local.pending(userId:user)
            await sync(); await reload()
            if pending.contains(where:{$0.id==item.id}) { message="已保存在本机，尚未同步。可在「我的 · 待同步」中查看。" }
            return true
        } catch { message=error.localizedDescription; return false }
    }
    func sync() async {
        guard loggedIn,!syncing else { return }; syncing=true; defer { syncing=false }
        do {
            for item in try local.pending(userId:user) {
                // Server deduplication lasts 24 hours. Never blindly replay an ambiguous older write.
                if Date().timeIntervalSince1970-item.createdAt>23*3600 {
                    try local.fail(item.id,message:"请求超过安全重试期限，请先核对记录再决定是否重新录入。"); break
                }
                guard item.failure == nil,let operation=APIOperation(rawValue:item.operation) else { break }
                do {
                    let params=try JSONDecoder().decode([String:String].self,from:item.params)
                    _ = try await api.raw(operation,params:params,body:item.body,key:item.id)
                    try local.remove(item.id)
                } catch {
                    if let e=error as? APIError,e.retryable { offline=true }
                    else { try local.fail(item.id,message:error.localizedDescription) }
                    break
                }
            }
            pending=try local.pending(userId:user)
        } catch { message=error.localizedDescription }
    }
    func discard(_ item:PendingWrite) async {
        do { try local.remove(item.id); pending=try local.pending(userId:user); await sync(); await reload() }
        catch { message=error.localizedDescription }
    }
    func onboarding(_ profile:Profile,context:DayContext) async {
        // Both writes are queued in order so a temporary outage can resume setup safely.
        guard await write(.saveProfile,body:profile) else { return }
        _ = await write(.context,params:["date":Timestamp.day(Timestamp.date(context.wakeAt) ?? Date(),timezone:profile.timezone)],body:context)
    }
    func context(_ context:DayContext) async {
        _ = await write(.context,params:["date":day?.date ?? Timestamp.day(Date())],body:context)
    }
    func setDraft(jpeg:Data? = nil,text:String = "") {
        draft=PhotoDraft(jpeg:jpeg,text:text); recognition=nil
        persistDraft()
    }
    private func persistDraft() {
        do { try local.cache(draft,key:cacheKey("draft")) } catch { message="草稿保存失败：\(error.localizedDescription)" }
    }
    func clearDraft() { draft=nil; recognition=nil; persistDraft() }
    func recognize(consent:Bool) async {
        guard var current=draft,consent,!recognizing else { return }
        recognizing=true; defer { recognizing=false; recognitionProgress=nil }
        current.consent=true; draft=current; persistDraft()
        do {
            if current.jobId == nil {
                guard Date().timeIntervalSince(current.createdAt)<23*3600 else { throw APIError(status:409,code:"DRAFT_EXPIRED",message:"草稿已超过安全重试期限，请手动记录，或重新选取照片。") }
                var payload:[String:Any]=["consent":true]
                if let jpeg=current.jpeg {
                    recognitionProgress="安全上传照片…"
                    if current.upload == nil {
                        current.upload=try await api.request(.presign,body:JSONSerialization.data(withJSONObject:["mime":"image/jpeg","bytes":jpeg.count]),key:current.uploadKey)
                        draft=current; persistDraft()
                    }
                    guard let ticket=current.upload,let expiry=Timestamp.date(ticket.expiresAt),expiry>Date() else { throw APIError(status:409,code:"UPLOAD_EXPIRED",message:"上传凭证已过期，请重新选取照片，或使用手动记录。") }
                    try await api.upload(jpeg,ticket:ticket); payload["uploadId"]=ticket.uploadId
                } else { payload["text"]=current.text }
                let job:Recognition=try await api.request(.recognize,body:JSONSerialization.data(withJSONObject:payload),key:current.jobKey)
                current.jobId=job.id; draft=current; persistDraft()
            }
            guard let jobId=current.jobId else { return }
            recognitionProgress="正在分析食物，结果需要你确认…"
            for _ in 0..<30 {
                try Task.checkCancellation()
                let job:Recognition=try await api.request(.recognition,params:["id":jobId]); recognition=job
                if job.status == "ready" { return }
                if job.status == "confirmed" { clearDraft(); await reload(); return }
                if job.status == "failed" { throw APIError(status:422,code:"RECOGNITION_FAILED",message:job.warning) }
                try await Task.sleep(for:.seconds(2))
            }
            message="识别仍在处理中，稍后可继续查看，也可以直接手动记录。"
        } catch is CancellationError { }
        catch { message=error.localizedDescription }
    }
    func deleteAccount() async -> Bool {
        do {
            let _:Ack=try await api.request(.deleteAccount)
            try local.clear(); KeychainStore.clear(); Notifications.clear()
            api.session=nil; loggedIn=false; profile=nil; day=nil; pending=[]; draft=nil; recognition=nil; catalog=[]; trends=nil
            return true
        } catch { message=error.localizedDescription; return false }
    }
}
