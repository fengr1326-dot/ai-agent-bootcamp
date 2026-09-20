import Foundation
import UserNotifications

@MainActor
enum Notifications {
    static func request() async throws -> Bool { try await UNUserNotificationCenter.current().requestAuthorization(options:[.alert,.sound,.badge]) }
    static func replace(_ reminders: [Reminder]) async throws {
        let center=UNUserNotificationCenter.current()
        // Keep Apple's non-Sendable request objects inside their callback. Only
        // immutable identifiers cross back to the main actor.
        let previous:[String]=await withCheckedContinuation { continuation in
            center.getPendingNotificationRequests { requests in
                continuation.resume(returning:requests.map(\.identifier))
            }
        }
        center.removePendingNotificationRequests(withIdentifiers:windowIdentifiers(previous))
        for reminder in reminders.prefix(8) {
            guard let date=Timestamp.date(reminder.at),date>Date() else { continue }
            let content=UNMutableNotificationContent();content.title=reminder.title;content.body=reminder.body;content.sound = .default
            content.categoryIdentifier="MEAL_WINDOW";content.userInfo=["notificationId":reminder.id]
            let trigger=UNTimeIntervalNotificationTrigger(timeInterval:max(1,date.timeIntervalSinceNow),repeats:false)
            try await center.add(UNNotificationRequest(identifier:reminder.id,content:content,trigger:trigger))
        }
    }
    nonisolated static func windowIdentifiers(_ identifiers:[String])->[String] { identifiers.filter{$0.hasPrefix("window-")} }
    static func clear() { UNUserNotificationCenter.current().removeAllPendingNotificationRequests();UNUserNotificationCenter.current().removeAllDeliveredNotifications() }
}
