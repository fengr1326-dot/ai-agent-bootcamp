import Foundation
import UserNotifications

@MainActor final class NotificationResponder:NSObject,UNUserNotificationCenterDelegate {
    weak var store:AppStore?
    init(store:AppStore) {
        self.store=store;super.init()
        let center=UNUserNotificationCenter.current()
        let later=UNNotificationAction(identifier:"SNOOZE",title:"30 分钟后再说",options:[])
        let open=UNNotificationAction(identifier:"OPEN",title:"看看下一餐",options:[.foreground])
        center.setNotificationCategories([UNNotificationCategory(identifier:"MEAL_WINDOW",actions:[open,later],intentIdentifiers:[],options:[.customDismissAction])])
        center.delegate=self
    }
    nonisolated func userNotificationCenter(_ center:UNUserNotificationCenter,didReceive response:UNNotificationResponse) async {
        guard let id=response.notification.request.content.userInfo["notificationId"] as? String else {return}
        let action=response.actionIdentifier == "SNOOZE" ? "snooze" : response.actionIdentifier == UNNotificationDismissActionIdentifier ? "ignored" : "opened"
        await handle(id:id,action:action)
    }
    private func handle(id:String,action:String) async {
        guard let store,store.loggedIn else {return}
        var body=["action":action]
        if action == "snooze" {body["until"]=Timestamp.string(Date().addingTimeInterval(30*60))}
        _ = await store.write(.respondNotification,params:["id":id],body:body)
        if action == "opened" {store.tab=0}
    }
    nonisolated func userNotificationCenter(_ center:UNUserNotificationCenter,willPresent notification:UNNotification) async -> UNNotificationPresentationOptions { [.banner,.sound] }
}
