import SwiftUI

struct MealEditorView:View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let route:MealEditorRoute
    @State private var input:MealInput
    @State private var time:Date
    @State private var query=""
    @State private var busy=false
    @State private var analysis:PreMeal?
    @State private var deleteConfirmation=false
    init(route:MealEditorRoute) {self.route=route;_input=State(initialValue:route.input);_time=State(initialValue:Timestamp.date(route.input.eatenAt) ?? Date())}
    var body:some View {
        NavigationStack {
            Form {
                Section {
                    Picker("这一餐",selection:$input.status) {Text("准备吃").tag("planned");Text("已经吃了").tag("eaten")}.pickerStyle(.segmented).accessibilityIdentifier("mealStatus")
                    Text(input.status == "planned" ? "先看看合不合适，不会计入今日摄入。" : "确认后计入今天，并重新安排下一餐。").font(.footnote).foregroundStyle(.secondary)
                    TextField("餐次名称",text:$input.title).accessibilityIdentifier("mealTitle")
                    DatePicker("时间",selection:$time)
                    Picker("整体份量",selection:$input.portion) {Text("小份").tag("small");Text("正常").tag("normal");Text("大份").tag("large")}.pickerStyle(.segmented)
                }
                Section("确认食物与基础份量") {
                    ForEach($input.items) { $item in
                        HStack {Text(store.catalog.first{$0.id==item.foodId}?.name ?? item.foodId);Spacer();TextField("克",value:$item.grams,format:.number).keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width:80);Text("g").foregroundStyle(.secondary)}
                    }.onDelete {input.items.remove(atOffsets:$0)}
                    Text("左滑移除错误食物；下方添加遗漏。小份/大份会在基础克数上统一缩放。").font(.caption).foregroundStyle(.secondary)
                }
                Section("添加食物") {
                    TextField("搜索食物",text:$query)
                    ForEach(store.catalog.filter{query.isEmpty || $0.name.contains(query) || $0.aliases.contains(where:{$0.contains(query)})}) { food in
                        Button {if let index=input.items.firstIndex(where:{$0.foodId==food.id}) {input.items[index].grams+=50} else if input.items.count<20 {input.items.append(MealItem(foodId:food.id,grams:100))}} label: {HStack {Text(food.name);Spacer();Image(systemName:"plus.circle")}}.accessibilityIdentifier("food-\(food.id)")
                    }
                    if store.catalog.isEmpty {Text("食物列表尚未载入，请先连接服务。").foregroundStyle(.secondary)}
                }
                if input.status == "planned" {
                    Section("吃前看一眼") {
                        Button("看看这个搭配") {Task {await analyze()}}.disabled(!valid || busy)
                        if let analysis {Text(analysis.judgment).foregroundStyle(analysis.canRecommend ? Palette.forest:Palette.clay);if analysis.canRecommend {Text(analysis.keep);ForEach(analysis.adjustments,id:\.self) {Text($0)}};Text(analysis.warning).font(.caption)}
                    }
                }
                Section {
                    Text("营养只能估算，油和酱料可能未被识别。过敏情况还需与实际食物制作者确认。").font(.footnote).foregroundStyle(.secondary)
                    Button(busy ? "正在保存…" : input.status == "eaten" ? "确认已吃" : "保存为准备吃") {Task {await save()}}.accessibilityIdentifier("saveMeal").disabled(!valid || busy)
                    if route.mealId != nil {Button("删除这条记录",role:.destructive) {deleteConfirmation=true}.disabled(busy)}
                }
            }.navigationTitle(route.mealId == nil ? "记下这一餐" : "调整这一餐").navigationBarTitleDisplayMode(.inline)
                .toolbar {Button("取消") {dismiss()}}
                .confirmationDialog("删除后将重新计算今天的状态",isPresented:$deleteConfirmation,titleVisibility:.visible) {Button("删除记录",role:.destructive) {Task {if await store.write(.deleteMeal,params:["id":route.mealId!],body:Empty()) {dismiss()}}}}
                .onChange(of:input.title) {_,_ in analysis=nil}
                .onChange(of:input.portion) {_,_ in analysis=nil}
                .onChange(of:input.items.map{"\($0.foodId):\($0.grams)"}) {_,_ in analysis=nil}
        }
    }
    private var valid:Bool {!input.title.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty && input.title.count<=120 && !input.items.isEmpty && input.items.allSatisfy{(0.01...3000).contains($0.grams)} && (input.status == "planned" || time<=Date().addingTimeInterval(60))}
    private func analyze() async {
        busy=true;defer {busy=false}
        do {var value=input;value.revision=nil;value.eatenAt=Timestamp.string(time);analysis=try await store.api.request(.preMeal,body:store.api.data(value))} catch {store.message=error.localizedDescription}
    }
    private func save() async {
        busy=true;defer {busy=false};input.eatenAt=Timestamp.string(time)
        var operation:APIOperation = .createMeal;var params:[String:String]=[:]
        if let id=route.mealId {operation = .updateMeal;params=["id":id]}
        else if let id=route.recognitionId {operation = .confirmRecognition;params=["id":id];input.revision=nil}
        else {input.revision=nil}
        if await store.write(operation,params:params,body:input) {
            if route.recognitionId != nil {store.clearDraft()}
            if store.pending.isEmpty {store.message=input.status == "eaten" ? "这一餐已记下。下一餐的时间和建议已更新，不用追赶数字。" : "已保存为准备吃，尚未计入营养摄入。"}
            store.tab=0;dismiss()
        }
    }
}
