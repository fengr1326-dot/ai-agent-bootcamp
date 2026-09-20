import Foundation
import GRDB

struct PendingWrite: Codable, FetchableRecord, PersistableRecord, Identifiable, Sendable {
    static let databaseTableName = "pending"
    var id: String; var userId: String; var operation: String; var params: Data; var body: Data; var createdAt: Double; var failure: String?
}
@MainActor
final class LocalStore {
    private let database: DatabaseQueue
    init(path: String? = nil) throws {
        if let path { database=try DatabaseQueue(path:path) }
        else {
            let dir=try FileManager.default.url(for:.applicationSupportDirectory,in:.userDomainMask,appropriateFor:nil,create:true).appendingPathComponent("MealRhythm",isDirectory:true)
            try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true,attributes:[.protectionKey:FileProtectionType.completeUntilFirstUserAuthentication])
            var protected=dir; var values=URLResourceValues(); values.isExcludedFromBackup=true; try protected.setResourceValues(values)
            database=try DatabaseQueue(path:dir.appendingPathComponent("local.sqlite").path)
        }
        var migrator=DatabaseMigrator()
        migrator.registerMigration("v1") { db in
            try db.create(table:"pending") { t in t.column("id",.text).primaryKey(); t.column("userId",.text).notNull(); t.column("operation",.text).notNull(); t.column("params",.blob).notNull(); t.column("body",.blob).notNull(); t.column("createdAt",.double).notNull(); t.column("failure",.text) }
            try db.create(table:"cache") { t in t.column("key",.text).primaryKey(); t.column("value",.blob).notNull() }
        }
        try migrator.migrate(database)
    }
    func enqueue(_ write: PendingWrite) throws { try database.write { db in try write.insert(db) } }
    func pending(userId: String) throws -> [PendingWrite] { try database.read { db in try PendingWrite.fetchAll(db,sql:"SELECT * FROM pending WHERE userId = ? ORDER BY createdAt",arguments:[userId]) } }
    func remove(_ id: String) throws { _ = try database.write { db in try PendingWrite.deleteOne(db,key:id) } }
    func fail(_ id: String,message: String) throws { try database.write { db in try db.execute(sql:"UPDATE pending SET failure = ? WHERE id = ?",arguments:[message,id]) } }
    func cache<T: Encodable>(_ value:T,key:String) throws { let data=try JSONEncoder().encode(value); try database.write { db in try db.execute(sql:"INSERT OR REPLACE INTO cache (key,value) VALUES (?,?)",arguments:[key,data]) } }
    func cached<T: Decodable>(_ type:T.Type,key:String) throws -> T? { let data=try database.read { db in try Data.fetchOne(db,sql:"SELECT value FROM cache WHERE key = ?",arguments:[key]) }; return try data.map { try JSONDecoder().decode(type,from:$0) } }
    func clear() throws { try database.write { db in try db.execute(sql:"DELETE FROM pending");try db.execute(sql:"DELETE FROM cache") } }
}
