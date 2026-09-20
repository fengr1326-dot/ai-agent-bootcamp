import SwiftUI

struct MealEditorRoute:Identifiable {
    let id=UUID(); var input:MealInput; var mealId:String?; var recognitionId:String?
}
struct TodayView: View {
    @Environment(AppStore.self) private var store
    @State private var profileSheet=false
    @State private var rhythmSheet=false
    @State private var nutritionSheet=false
    @State private var editor:MealEditorRoute?
    var body:some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:26) {
                    HStack {
                        VStack(alignment:.leading,spacing:6) {Text(Date().formatted(.dateTime.month(.wide).day().weekday(.wide))).font(.caption).foregroundStyle(.secondary);Text("今天，慢慢来。 ").font(.largeTitle.weight(.semibold))}
                        Spacer();Button {profileSheet=true} label:{Image(systemName:"person.crop.circle").font(.title)}.accessibilityLabel("我的")
                    }
                    if store.offline || !store.pending.isEmpty {
                        Label(store.offline ? "离线浏览 · 显示上次同步结果" : "\(store.pending.count) 项待同步，尚未计入今日",systemImage:"arrow.triangle.2.circlepath").font(.footnote).foregroundStyle(Palette.clay)
                    }
                    if let day=store.day {
                        windowCard(day)
                        if let message=day.safety.message {
                            VStack(alignment:.leading,spacing:12) {Label(message,systemImage:"hand.raised").font(.subheadline);if day.safety.needsConstraints {Button("确认过敏与忌口") {profileSheet=true}.font(.headline)}}.card()
                        }
                        VStack(alignment:.leading,spacing:16) {
                            HStack {SectionTitle(eyebrow:"A LITTLE BALANCE",title:"今天值得照顾的");Spacer();Button {nutritionSheet=true} label:{Image(systemName:"arrow.up.right")}.accessibilityLabel("营养详情")}
                            if day.nutrition.highlights.isEmpty {Text("记录就很好，不必追赶数字。").foregroundStyle(.secondary)}
                            ForEach(day.nutrition.highlights) { gap in
                                HStack {
                                    Image(systemName:gap.key == "water" ? "drop" : gap.key == "protein" ? "oval" : "leaf").frame(width:26)
                                    VStack(alignment:.leading,spacing:4) {Text(gap.label).font(.headline);Text(gap.status == "insufficientData" ? "先记一餐，再看估算" : day.nutrition.bedtime ? "今天可以放轻松" : "可以在下一餐顺便照顾").font(.caption).foregroundStyle(.secondary)}
                                    Spacer();Text(gap.status == "insufficientData" ? "待了解" : "\(gap.remaining.display) \(gap.unit)").font(.subheadline.monospacedDigit())
                                }
                            }
                        }.card()
                        if !day.recommendations.isEmpty {
                            SectionTitle(eyebrow:"YOUR NEXT BITE",title:"下一餐，这样也不错")
                            ForEach(Array(day.recommendations.enumerated()),id:\.element.id) { index,recommendation in
                                recommendationCard(recommendation,primary:index==0)
                            }
                        }
                        HStack {SectionTitle(eyebrow:"A DAY IN MEALS",title:"今天的记录");Spacer();Button("记一餐") {store.tab=1}.accessibilityIdentifier("recordMeal")}
                        if day.meals.isEmpty {VStack(alignment:.leading,spacing:8) {Text("这里留给你的第一餐。").font(.headline);Text("拍张照或简单选一下，不必补记过去。").font(.subheadline).foregroundStyle(.secondary)}.card()}
                        ForEach(day.meals) { meal in
                            Button { editor=MealEditorRoute(input:meal.input,mealId:meal.id) } label: {
                                HStack(spacing:14) {
                                    Image(systemName:meal.status == "planned" ? "clock" : "fork.knife").font(.title3).frame(width:42,height:42).background(Palette.sage,in:Circle())
                                    VStack(alignment:.leading,spacing:6) {Text(meal.title).font(.headline);Text("\(Timestamp.time(meal.eatenAt)) · \(meal.status == "planned" ? "准备吃 · 未计入" : "已吃 · 已计入")").font(.caption).foregroundStyle(.secondary)}
                                    Spacer();Image(systemName:"chevron.right").font(.caption)
                                }.card()
                            }.buttonStyle(.plain)
                        }
                        Text("开发预览 · 食物数据待审核 · 所有营养值均为估算区间").font(.caption2).foregroundStyle(.secondary).frame(maxWidth:.infinity)
                    } else {ContentUnavailableView("正在了解今天",systemImage:"sun.horizon",description:Text("连接服务后载入你的节奏。"));Button("重新连接") {Task{await store.reload()}}}
                }.padding(22)
            }.background(Palette.background).toolbar(.hidden,for:.navigationBar)
                .refreshable {await store.sync();await store.reload()}
                .sheet(isPresented:$profileSheet) {ProfileView()}
                .sheet(isPresented:$rhythmSheet) {if let day=store.day {RhythmView(day:day)}}
                .sheet(isPresented:$nutritionSheet) {if let day=store.day {NutritionView(day:day)}}
                .sheet(item:$editor) {MealEditorView(route:$0)}
        }
    }
    private func windowCard(_ day:Day)->some View {
        VStack(alignment:.leading,spacing:18) {
            HStack {Label(day.window.mode == "rest" ? "让今天好好收尾" : "下一餐的舒适窗口",systemImage:day.window.mode == "rest" ? "moon" : "sun.horizon").font(.subheadline);Spacer();Button {rhythmSheet=true} label:{Image(systemName:"slider.horizontal.3")}.accessibilityLabel("调整今日节奏")}
            Text(day.window.start == nil ? "慢下来，休息吧" : "\(Timestamp.time(day.window.start)) – \(Timestamp.time(day.window.end))").font(.system(.largeTitle,design:.rounded,weight:.medium)).minimumScaleFactor(0.65).lineLimit(1)
            Text(day.window.reason).font(.subheadline).foregroundStyle(.white.opacity(0.8))
            HStack {
                Button("我饿了") {var context=day.context;context.hunger="hungry";Task {await store.context(context)}}
                Spacer()
                Button("稍后再吃") {var context=day.context;context.snoozedUntil=Timestamp.string(Date().addingTimeInterval(30*60));Task {await store.context(context)}}
            }.font(.subheadline.weight(.medium)).padding(.top,4)
        }.padding(24).foregroundStyle(.white).background(Palette.forest,in:RoundedRectangle(cornerRadius:28))
    }
    private func recommendationCard(_ recommendation:Recommendation,primary:Bool)->some View {
        VStack(alignment:.leading,spacing:14) {
            HStack {Text(primary ? "给你的首选" : "换个口味").font(.caption.weight(.medium));Spacer();Label("\(recommendation.minutes) 分钟",systemImage:"clock").font(.caption)}.foregroundStyle(Palette.forest)
            Text(recommendation.title).font(primary ? .title2.bold() : .headline)
            Text(recommendation.reasons.joined(separator:" · ")).font(.subheadline).foregroundStyle(.secondary)
            HStack {
                Button("准备吃这个") {editor=MealEditorRoute(input:recommendation.input);Task {_ = await store.write(.feedback,params:["id":recommendation.id],body:["action":"adopt"])}}.font(.headline)
                Spacer();Menu {Button("不喜欢，换掉它") {Task {_ = await store.write(.feedback,params:["id":recommendation.id],body:["action":"dislike"])}}} label:{Image(systemName:"ellipsis").padding(8)}.accessibilityLabel("推荐反馈")
            }
        }.card()
    }
}
struct NutritionView:View {
    let day:Day
    @Environment(\.dismiss) private var dismiss
    var body:some View {
        NavigationStack {
            List {
                Section {
                    Text("照片、份量、酱料都会带来误差。区间是参考，不是需要完成的任务。")
                    Text("已确认 \(day.nutrition.mealCount) 餐 · 估算可信度：\(day.nutrition.confidence == "low" ? "较低" : "中等")")
                }
                ForEach(day.nutrition.gaps) { gap in
                    Section(gap.label) {
                        LabeledContent("已记录",value:"\(day.nutrition.consumed[gap.key]?.display ?? "0") \(gap.unit)")
                        LabeledContent("参考范围",value:"\(day.nutrition.targets?[gap.key]?.display ?? "不提供") \(gap.unit)")
                        Text(gap.status == "possiblyExcess" ? "可能已较充足，无需额外追补。" : "依据当天实际情况灵活调整。").font(.footnote)
                    }
                }
                Section {
                    Text("规则：\(day.nutrition.ruleVersion)")
                    Text("食物数据：\(day.catalogVersion)")
                }.font(.caption)
            }.navigationTitle("今天的营养估算")
                .toolbar {Button("完成") {dismiss()}}
        }
    }
}
struct RhythmView:View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let day:Day
    @State private var wake=Date();@State private var sleep=Date();@State private var training=Date();@State private var hasTraining=false;@State private var hunger="normal";@State private var ended=false
    var body:some View {
        NavigationStack {Form {
            Section("今天的实际作息") {DatePicker("起床",selection:$wake);DatePicker("睡觉",selection:$sleep);Toggle("今天有训练",isOn:$hasTraining);if hasTraining {DatePicker("训练",selection:$training)}}
            Section {Picker("现在的感觉",selection:$hunger) {Text("刚刚好").tag("normal");Text("有些饿了").tag("hungry");Text("还不饿").tag("notHungry")};Toggle("结束今天的建议",isOn:$ended)}
            Text("起床与睡眠相隔 4–24 小时。跨午夜请选实际日期。").font(.footnote)
            Button("保存节奏") {Task {await store.context(DayContext(wakeAt:Timestamp.string(wake),sleepAt:Timestamp.string(sleep),trainingAt:hasTraining ? Timestamp.string(training):nil,hunger:hunger,ended:ended));dismiss()}}.disabled(!(4*3600...24*3600).contains(sleep.timeIntervalSince(wake)) || (hasTraining && !(wake...sleep).contains(training)))
        }.navigationTitle("今天的节奏").toolbar {Button("取消") {dismiss()}}.onAppear {wake=Timestamp.date(day.context.wakeAt) ?? Date();sleep=Timestamp.date(day.context.sleepAt) ?? Date();training=Timestamp.date(day.context.trainingAt ?? "") ?? wake.addingTimeInterval(10*3600);hasTraining=day.context.trainingAt != nil;hunger=day.context.hunger;ended=day.context.ended}}
    }
}
