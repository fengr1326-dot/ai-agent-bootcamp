import SwiftUI
import AuthenticationServices
import CryptoKit

@main @MainActor
struct MealRhythmApp: App {
    @State private var store:AppStore?
    @State private var startupError:String?
    var body:some Scene {
        WindowGroup {
            Group {
                if let store { RootView().environment(store) }
                else if let startupError { ContentUnavailableView("无法打开本机存储",systemImage:"externaldrive.badge.exclamationmark",description:Text(startupError)) }
                else { ProgressView("准备餐时…") }
            }
            .tint(Palette.forest).task {
                guard store == nil,startupError == nil else { return }
                do {
                    let configured=Bundle.main.object(forInfoDictionaryKey:"API_BASE_URL") as? String ?? "http://localhost:3000"
                    guard let url=URL(string:configured) else { throw APIError(status:0,code:"CONFIG",message:"服务地址配置错误") }
                    let value=AppStore(api:APIClient(baseURL:url),local:try LocalStore()); store=value; await value.start()
                } catch { startupError=error.localizedDescription }
            }
        }
    }
}
struct RootView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.scenePhase) private var phase
    var body:some View {
        @Bindable var store=store
        Group {
            if !store.loggedIn { WelcomeView() }
            else if store.profile == nil { OnboardingView() }
            else {
                TabView(selection:$store.tab) {
                    TodayView().tabItem { Label("今日",systemImage:"sun.max") }.tag(0)
                    CaptureView().tabItem { Label("记一餐",systemImage:"camera.fill") }.tag(1)
                    TrendsView().tabItem { Label("节奏",systemImage:"chart.bar.xaxis") }.tag(2)
                }
            }
        }
        .alert("提示",isPresented:Binding(get:{store.message != nil},set:{if !$0 {store.message=nil}})) { Button("知道了",role:.cancel) { store.message=nil } } message: { Text(store.message ?? "") }
        .onChange(of:phase) { _,value in if value == .active { Task { await store.sync(); await store.reload() } } }
    }
}
struct WelcomeView: View {
    @Environment(AppStore.self) private var store
    @State private var nonce=""
    var body:some View {
        ZStack {
            Palette.background.ignoresSafeArea()
            VStack(alignment:.leading,spacing:24) {
                Text("餐 时  /  MEAL RHYTHM").font(.caption.weight(.semibold)).tracking(3)
                Spacer()
                Image(systemName:"leaf.circle").font(.system(size:110,weight:.ultraLight)).foregroundStyle(Palette.forest).accessibilityHidden(true)
                Text("好好吃饭，\n从下一餐开始。").font(.system(.largeTitle,design:.serif,weight:.medium))
                Text("不追赶数字，不要求完美。\n找到适合你的饮食节奏。").foregroundStyle(.secondary).lineSpacing(6)
                Spacer()
                Text("开发预览 · 营养数据和规则尚未专业审核，不提供医疗建议。你的记录不会自动用于模型训练。").font(.footnote).foregroundStyle(.secondary)
                SignInWithAppleButton(.continue) { request in
                    nonce=UUID().uuidString+UUID().uuidString
                    request.nonce=SHA256.hash(data:Data(nonce.utf8)).map{String(format:"%02x",$0)}.joined()
                } onCompletion: { result in
                    switch result {
                    case .success(let authorization):
                        guard let credential=authorization.credential as? ASAuthorizationAppleIDCredential,let bytes=credential.identityToken,let token=String(data:bytes,encoding:.utf8) else { store.message="未能取得 Apple 登录凭据"; return }
                        Task { do { await store.signIn(.apple,body:try store.api.data(["identityToken":token,"nonce":nonce])) } catch {store.message=error.localizedDescription} }
                    case .failure(let error): store.message=error.localizedDescription
                    }
                }.frame(height:52).clipShape(RoundedRectangle(cornerRadius:14)).disabled(store.loading)
                #if DEBUG
                Button("以开发体验账号开始") { Task { await store.signIn(.guest,body:Data("{}".utf8)) } }.buttonStyle(PrimaryButton()).accessibilityIdentifier("guestLogin").disabled(store.loading)
                #endif
                if store.loading { ProgressView() }
            }.padding(28)
        }
    }
}
