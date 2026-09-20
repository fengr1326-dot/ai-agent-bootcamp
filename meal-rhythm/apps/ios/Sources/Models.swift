import Foundation

struct Envelope<T: Decodable & Sendable>: Decodable, Sendable { let data: T; let requestId: String }
struct Empty: Codable, Sendable {}
struct Ack: Codable, Sendable { let saved: Bool?; let deleted: Bool? }
struct Session: Codable, Sendable { let accessToken: String; let refreshToken: String; let expiresIn: Int; let userId: String }
enum Direction: String, Codable, CaseIterable, Identifiable, Sendable {
    case feelGood, leanFit, buildShape
    var id: String { rawValue }
    var title: String { switch self { case .feelGood: "舒服而有活力"; case .leanFit: "轻盈且有力量"; case .buildShape: "强壮与成长" } }
    var english: String { switch self { case .feelGood: "FEEL GOOD"; case .leanFit: "LEAN & FIT"; case .buildShape: "BUILD & SHAPE" } }
    var detail: String { switch self { case .feelGood: "均衡饮食，找到适合自己的节奏"; case .leanFit: "关注饱腹感、力量和可持续的习惯"; case .buildShape: "照顾训练，及时补充能量与蛋白质" } }
    var symbol: String { switch self { case .feelGood: "leaf"; case .leanFit: "figure.walk"; case .buildShape: "figure.strengthtraining.traditional" } }
}
struct Profile: Codable, Sendable {
    var direction: Direction = .feelGood
    var focus = "吃得更均衡"
    var age = 28
    var heightCm: Double = 170
    var weightKg: Double = 65
    var sex = "unspecified"
    var activity = "moderate"
    var timezone = TimeZone.current.identifier
    var allergies: [String] = []
    var excludedFoods: [String] = []
    var risks: [String] = []
    var constraintsConfirmed = false
    var modelImprovementConsent = false
}
struct ValueRange: Codable, Sendable { let min: Double; let max: Double
    var display: String { "\(Int(min.rounded()))–\(Int(max.rounded()))" }
}
typealias Nutrition = [String: ValueRange]
struct DayContext: Codable, Sendable {
    var wakeAt: String; var sleepAt: String; var trainingAt: String?
    var hunger: String = "normal"; var snoozedUntil: String?; var ended = false
}
struct MealItem: Codable, Identifiable, Sendable { var foodId: String; var grams: Double; var id: String { foodId } }
struct MealInput: Codable, Sendable {
    var title: String; var eatenAt: String; var status: String; var portion: String; var items: [MealItem]; var confidence: String
    var revision: Int?
}
struct Meal: Codable, Identifiable, Sendable {
    let id: String; let revision: Int; let title: String; let eatenAt: String; let status: String
    let portion: String; let items: [MealItem]; let confidence: String; let nutrition: Nutrition
    let createdAt: String; let updatedAt: String; let sourceVersion: String
    var input: MealInput { MealInput(title:title,eatenAt:eatenAt,status:status,portion:portion,items:items,confidence:confidence,revision:revision) }
}
struct Food: Codable, Identifiable, Sendable { let id: String; let name: String; let aliases: [String]; let per100g: [String: Double]; let allergens: [String]; let category: String; let source: String }
struct Catalog: Codable, Sendable { let version: String; let experimental: Bool; let items: [Food] }
struct Gap: Codable, Identifiable, Sendable { let key: String; let remaining: ValueRange; let status: String; let label: String; let unit: String; var id: String { key } }
struct NutritionState: Codable, Sendable { let consumed: Nutrition; let targets: Nutrition?; let gaps: [Gap]; let highlights: [Gap]; let confidence: String; let mealCount: Int; let bedtime: Bool; let ruleVersion: String }
struct MealWindow: Codable, Sendable { let start: String?; let end: String?; let reason: String; let mode: String }
struct Safety: Codable, Sendable { let blocked: Bool; let needsConstraints: Bool; let message: String? }
struct Recommendation: Codable, Identifiable, Sendable {
    let id: String; let title: String; let items: [MealItem]; let scene: String; let minutes: Int; let substitution: String
    let reasons: [String]; let score: Double; let nutrition: Nutrition; let ruleVersion: String
    var input: MealInput { MealInput(title:title,eatenAt:Timestamp.string(Date()),status:"planned",portion:"normal",items:items,confidence:"medium") }
}
struct NotificationPreferences: Codable, Sendable { var enabled: Bool; var quietStart: Int; var quietEnd: Int; var ignoredCount: Int }
struct Reminder: Codable, Identifiable, Sendable { let id: String; let at: String; let title: String; let body: String; let status: String; let attempts: Int }
struct Day: Codable, Sendable {
    let date: String; let context: DayContext; let window: MealWindow; let nutrition: NutritionState; let meals: [Meal]
    let recommendations: [Recommendation]; let safety: Safety; let notificationPreferences: NotificationPreferences; let catalogVersion: String; let experimental: Bool
}
struct PreMeal: Codable, Sendable { let meal: Meal; let canRecommend: Bool; let judgment: String; let keep: String; let adjustments: [String]; let warning: String }
struct Recognition: Codable, Identifiable, Sendable {
    let id: String; let status: String; let items: [MealItem]; let confidence: String; let warning: String
}
struct UploadTicket: Codable, Sendable { let uploadId: String; let url: String; let expiresAt: String }
struct TrendDay: Codable, Identifiable, Sendable { let date: String; let mealCount: Int; let consumed: Nutrition; let confidence: String; var id: String { date } }
struct Trends: Codable, Sendable { let days: [TrendDay]; let message: String }

enum Timestamp {
    static func string(_ date: Date) -> String { date.formatted(.iso8601.year().month().day().time(includingFractionalSeconds: true).timeZone(separator: .omitted)) }
    static func date(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
    static func day(_ date: Date, timezone: String = TimeZone.current.identifier) -> String {
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian); formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: timezone); formatter.dateFormat = "yyyy-MM-dd"; return formatter.string(from: date)
    }
    static func time(_ value: String?) -> String { guard let value, let date = date(value) else { return "稍后" }; return date.formatted(date:.omitted,time:.shortened) }
}
