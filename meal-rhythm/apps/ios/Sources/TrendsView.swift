import SwiftUI
import Charts

struct TrendsView:View {
    @Environment(AppStore.self) private var store
    var body:some View {
        NavigationStack {ScrollView {VStack(alignment:.leading,spacing:24) {
            SectionTitle(eyebrow:"SMALL STEPS, EVERY DAY",title:"找到自己的节奏。")
            Text("看见习惯，不给自己打分。").foregroundStyle(.secondary)
            if let trends=store.trends {
                VStack(alignment:.leading,spacing:18) {Text("最近七天 · 已记录餐次").font(.headline)
                    Chart(trends.days) {day in BarMark(x:.value("日期",String(day.date.suffix(5))),y:.value("餐次",day.mealCount)).foregroundStyle(Palette.forest).cornerRadius(5)}.frame(height:200).chartYAxis {AxisMarks(values:.stride(by:1))}.accessibilityLabel("最近七天餐次记录")
                }.card()
                ForEach(trends.days.reversed()) {day in HStack {Text(day.date);Spacer();Text(day.mealCount == 0 ? "留白也没关系" : "记下了 \(day.mealCount) 餐").foregroundStyle(.secondary)}.card()}
                Text(trends.message).font(.subheadline).foregroundStyle(.secondary)
            } else {ContentUnavailableView("节奏会慢慢清晰",systemImage:"chart.bar",description:Text("联网后查看最近七天的记录。"))}
        }.padding(24)}.background(Palette.background).navigationTitle("我的节奏").navigationBarTitleDisplayMode(.inline).refreshable {await store.reload()}}
    }
}
