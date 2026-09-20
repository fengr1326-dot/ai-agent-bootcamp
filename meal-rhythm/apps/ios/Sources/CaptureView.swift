import SwiftUI
import PhotosUI

struct CaptureView:View {
    @Environment(AppStore.self) private var store
    @State private var camera=false
    @State private var selection:PhotosPickerItem?
    @State private var text=""
    @State private var consent=false
    @State private var busy=false
    @State private var editor:MealEditorRoute?
    @State private var discard=false
    var body:some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:24) {
                    SectionTitle(eyebrow:"JUST ONE MEAL",title:"记一餐，就很好。")
                    Text("拍照只是起点，最后由你确认。").foregroundStyle(.secondary)
                    ZStack {
                        RoundedRectangle(cornerRadius:28).fill(Palette.sage).frame(height:240)
                        if let bytes=store.draft?.jpeg,let photo=UIImage(data:bytes) {Image(uiImage:photo).resizable().scaledToFill().frame(height:240).clipped().clipShape(RoundedRectangle(cornerRadius:28))}
                        else {VStack(spacing:16) {Image(systemName:"camera.viewfinder").font(.system(size:68,weight:.ultraLight));Text("把整份餐食放入画面").font(.headline);Text("光线明亮一点，估算更容易").font(.caption)}}
                    }.foregroundStyle(Palette.forest)
                    HStack(spacing:16) {
                        Button {camera=true} label:{Label("拍一张",systemImage:"camera")}.buttonStyle(PrimaryButton())
                        PhotosPicker(selection:$selection,matching:.images,photoLibrary:.shared()) {Label("选照片",systemImage:"photo")}.font(.headline).frame(maxWidth:.infinity)
                    }.disabled(busy)
                    VStack(alignment:.leading,spacing:12) {
                        Text("也可以简单说说").font(.headline)
                        TextField("例如：一碗米饭、鸡肉和西兰花",text:$text,axis:.vertical).lineLimit(3...5).accessibilityIdentifier("mealDescription")
                        Button("保存文字草稿") {store.setDraft(text:text.trimmingCharacters(in:.whitespacesAndNewlines))}.disabled(text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || text.count>1000 || busy)
                    }.card()
                    if let draft=store.draft {
                        VStack(alignment:.leading,spacing:12) {
                            Label("草稿已保存在本机",systemImage:"checkmark.shield").font(.headline)
                            if draft.jpeg == nil {Text(draft.text)}
                            Toggle("同意将本次照片或文字发送至配置的识别服务",isOn:$consent).font(.subheadline)
                            Text("上传前移除照片位置信息。不包含你的身体资料；默认不授权模型训练。识别服务由部署方配置，未配置时请手动记录。").font(.caption).foregroundStyle(.secondary)
                            Button(busy ? (store.recognitionProgress ?? "处理中…") : draft.jobId == nil ? "开始识别" : "继续查看识别") {busy=true;Task {await store.recognize(consent:consent);busy=false}}.buttonStyle(PrimaryButton()).disabled(!consent || busy)
                            if let recognition=store.recognition {
                                Text(recognition.warning).font(.footnote)
                                if recognition.status == "ready" {Button("确认和修正食物") {editor=MealEditorRoute(input:MealInput(title:"这一餐",eatenAt:Timestamp.string(Date()),status:"eaten",portion:"normal",items:recognition.items,confidence:recognition.confidence),recognitionId:recognition.id)}.buttonStyle(PrimaryButton())}
                            }
                            Button("删除本机草稿",role:.destructive) {discard=true}.disabled(busy)
                        }.card()
                    }
                    Button {editor=MealEditorRoute(input:MealInput(title:"这一餐",eatenAt:Timestamp.string(Date()),status:"eaten",portion:"normal",items:[],confidence:"medium"))} label:{Label("不识别，直接手动记录",systemImage:"square.and.pencil")}.frame(maxWidth:.infinity).padding().accessibilityIdentifier("manualMeal")
                    Text("识别不能判断食物是否安全，也不能排除隐藏的过敏原。请以实际食材为准。").font(.caption).foregroundStyle(.secondary)
                }.padding(24)
            }.background(Palette.background).navigationTitle("记一餐").navigationBarTitleDisplayMode(.inline)
                .sheet(isPresented:$camera) {ZStack(alignment:.topTrailing) {CameraView {data,error in camera=false;if let error {store.message=error};if let data {prepare(data)}}.ignoresSafeArea();Button("关闭") {camera=false}.padding().background(.ultraThinMaterial,in:Capsule()).padding()}}
                .sheet(item:$editor) {MealEditorView(route:$0)}
                .onChange(of:selection) { _,item in
                    Task { await loadPhoto(item) }
                }
                .confirmationDialog("只删除本机草稿；已上传的照片随账号删除清理。",isPresented:$discard,titleVisibility:.visible) {Button("删除草稿",role:.destructive) {store.clearDraft()}}
        }
    }
    private func prepare(_ data:Data) {do {store.setDraft(jpeg:try ImagePreparer.jpeg(data));consent=false} catch {store.message=error.localizedDescription}}
    private func loadPhoto(_ item:PhotosPickerItem?) async {
        guard let item else {return}
        do {
            let loaded=try await item.loadTransferable(type:Data.self)
            if let loaded {prepare(loaded)}
        } catch {
            store.message=error.localizedDescription
        }
    }
}
