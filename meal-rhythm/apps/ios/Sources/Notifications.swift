import Foundation
import UserNotifications

@MainActor
enum Notifications {
    static func request() async throws -> Bool { try await UNUserNotificationCenter.current().requestAuthorization(options:[.alert,.sound,.badge]) }
    static func replace(_ reminders: [Reminder]) async throws {
        let center=UNUserNotificationCenter.current()
        let previous=await center.pendingNotificationRequests()
        center.removePendingNotificationRequests(withIdentifiers:previous.filter{$0.identifier.hasPrefix("window-")}.map(\.identifier))
        for reminder in reminders.prefix(8) {
            guard let date=Timestamp.date(reminder.at),date>Date() else { continue }
            let content=UNMutableNotificationContent();content.title=reminder.title;content.body=reminder.body;content.sound = .default
            content.categoryIdentifier="MEAL_WINDOW";content.userInfo=["notificationId":reminder.id]
            let trigger=UNTimeIntervalNotificationTrigger(timeInterval:max(1,date.timeIntervalSinceNow),repeats:false)
            try await center.add(UNNotificationRequest(identifier:reminder.id,content:content,trigger:trigger))
        }
    }
    static func clear() { UNUserNotificationCenter.current().removeAllPendingNotificationRequests();UNUserNotificationCenter.current().removeAllDeliveredNotifications() }
}
