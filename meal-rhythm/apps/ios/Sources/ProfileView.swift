import SwiftUI
import UniformTypeIdentifiers

struct JSONExport:FileDocument {
    static var readableContentTypes:[UTType] { [.json] }
    var data:Data
    init(data:Data) {self.data=data}
    init(configuration:ReadConfiguration) throws {data=configuration.file.regularFileContents ?? Data()}
    func fileWrapper(configuration:WriteConfiguration) throws -> FileWrapper {FileWrapper(regularFileWithContents:data)}
}
struct ProfileView:View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var profile=Profile()
    @State private var allergies=""
    @State private var excluded=""
    @State private var notifications=NotificationPreferences(enabled:false,quietStart:22,quietEnd:8,ignoredCount:0)
    @State private var deleteConfirmation=false
    @State private var discard:PendingWrite?
    @State private var export:JSONExport?
    @State private var exporting=false
    @State private var busy=false
    var body:some View {
        NavigationStack {Form {
            Section("我的方向") {
                Picker("方向",selection:$profile.direction) {ForEach(Direction.allCases) {Text($0.title).tag($0)}}
                TextField("关注的小事",text:$profile.focus)
                Stepper("年龄 \(profile.age)",value:$profile.age,in:13...100)
                HStack {Text("身高 cm");TextField("身高",value:$profile.heightCm,format:.number).keyboardType(.decimalPad)}
                HStack {Text("体重 kg");TextField("体重",value:$profile.weightKg,format:.number).keyboardType(.decimalPad)}
                Picker("活动量",selection:$profile.activity) {Text("较少").tag("low");Text("中等").tag("moderate");Text("较多").tag("high")}
            }
            Section("先照顾安全") {
                TextField("过敏食物，以逗号分隔",text:$allergies)
                TextField("不吃的食物，以逗号分隔",text:$excluded)
                Toggle("已确认过敏与忌口（没有也请确认）",isOn:$profile.constraintsConfirmed)
                ForEach(["pregnancy","clinical","eatingDisorder","extremeGoal"],id:\.self) {risk in
                    Toggle(["pregnancy":"孕期或哺乳期","clinical":"需要临床营养支持","eatingDisorder":"存在进食困扰","extremeGoal":"正在尝试极端体重目标"][risk]!,isOn:Binding(get:{profile.risks.contains(risk)},set:{enabled in if enabled {if !profile.risks.contains(risk) {profile.risks.append(risk)}} else {profile.risks.removeAll{$0==risk}}}))
                }
                Text("特殊情况只保留记录，不提供个性化目标。食物库有限，不能替代实际过敏原核查。").font(.caption).foregroundStyle(.secondary)
                Button("保存资料") {busy=true;profile.allergies=split(allergies);profile.excludedFoods=split(excluded);Task {_ = await store.write(.saveProfile,body:profile);busy=false}}.disabled(busy || !(100...230).contains(profile.heightCm) || !(25...250).contains(profile.weightKg))
            }
            Section("轻一点的提醒") {
                Toggle("下一餐提醒",isOn:$notifications.enabled)
                Stepper("安静时段开始：\(notifications.quietStart):00",value:$notifications.quietStart,in:0...23)
                Stepper("安静时段结束：\(notifications.quietEnd):00",value:$notifications.quietEnd,in:0...23)
                Button("保存提醒设置") {Task {do {if notifications.enabled {let granted=try await Notifications.request();if !granted {notifications.enabled=false;store.message="系统通知权限未开启，可在系统设置中修改。"}};_ = await store.write(.notificationPreferences,body:notifications)} catch {store.message=error.localizedDescription}}}
            }
            if !store.pending.isEmpty {
                Section("待同步 · \(store.pending.count)") {
                    ForEach(store.pending) {item in VStack(alignment:.leading,spacing:6) {Text(item.operation).font(.headline);Text(item.failure ?? "等待联网重试").font(.caption);Text("\(Date(timeIntervalSince1970:item.createdAt).formatted())").font(.caption2);Button("放弃本机待同步请求",role:.destructive) {discard=item}}}
                    Button("立即同步") {Task {await store.sync();await store.reload()}}
                    Text("冲突会暂停队列。放弃前先核对服务端记录，避免重复录入。").font(.caption)
                }
            }
            Section("你的数据由你决定") {
                Text("模型改进授权：未开启。识别只在每次明确同意后上传。当前版本没有模型训练功能。").font(.footnote)
                Button("导出我的数据") {Task {do {export=JSONExport(data:try await store.api.raw(.export,body:Data("{}".utf8)));exporting=true} catch {store.message=error.localizedDescription}}}
                Button("删除账号与全部数据",role:.destructive) {deleteConfirmation=true}.disabled(busy)
            }
            Section {Text("餐时 0.1 · 开发预览");Text("营养数据及个性化规则未通过专业审核，禁止用于医疗建议或公开生产服务。").font(.caption);Text("服务：\(store.api.baseURL.absoluteString)").font(.caption)}
        }.navigationTitle("我的").toolbar {Button("完成") {dismiss()}}
            .onAppear {profile=store.profile ?? Profile();allergies=profile.allergies.joined(separator:"，");excluded=profile.excludedFoods.joined(separator:"，");notifications=store.day?.notificationPreferences ?? notifications}
            .confirmationDialog("永久删除账号、餐次、照片和本机缓存？此操作无法撤销。",isPresented:$deleteConfirmation,titleVisibility:.visible) {Button("永久删除",role:.destructive) {busy=true;Task {if await store.deleteAccount() {dismiss()};busy=false}}}
            .confirmationDialog("只放弃本机请求，不会撤销服务端可能已完成的记录。",isPresented:Binding(get:{discard != nil},set:{if !$0 {discard=nil}}),titleVisibility:.visible) {Button("放弃请求",role:.destructive) {if let item=discard {Task {await store.discard(item)}};discard=nil}}
            .fileExporter(isPresented:$exporting,document:export,contentType:.json,defaultFilename:"餐时-数据导出") {result in if case .failure(let error)=result {store.message=error.localizedDescription};export=nil}
        }
    }
    private func split(_ text:String)->[String] {text.components(separatedBy:CharacterSet(charactersIn:",，;；\n")).map{$0.trimmingCharacters(in:.whitespacesAndNewlines)}.filter{!$0.isEmpty}}
}
