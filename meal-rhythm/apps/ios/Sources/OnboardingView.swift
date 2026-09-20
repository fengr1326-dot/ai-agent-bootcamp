import SwiftUI

struct OnboardingView: View {
    @Environment(AppStore.self) private var store
    @State private var step=0
    @State private var profile=Profile()
    @State private var wake=Calendar.current.date(bySettingHour:8,minute:0,second:0,of:Date())!
    @State private var sleep=Calendar.current.date(bySettingHour:23,minute:0,second:0,of:Date())!
    @State private var busy=false
    private let titles=["你想往哪个方向？","从一件小事开始。","更了解你一点。","平时有多活跃？","今天，按你的节奏。"]
    var body:some View {
        ZStack {
            Palette.background.ignoresSafeArea()
            VStack(alignment:.leading,spacing:24) {
                HStack { Text("认识你 · \(step+1) / 5").font(.caption).tracking(2); Spacer(); if step>0 { Button("上一步") {step-=1} } }
                ProgressView(value:Double(step+1),total:5)
                Text(titles[step]).font(.largeTitle.weight(.semibold))
                ScrollView {
                    VStack(alignment:.leading,spacing:18) {
                        switch step {
                        case 0:
                            ForEach(Direction.allCases) { direction in
                                Button { profile.direction=direction } label: {
                                    HStack(alignment:.top,spacing:16) {
                                        Image(systemName:direction.symbol).font(.title)
                                        VStack(alignment:.leading,spacing:8) { Text(direction.english).font(.caption).tracking(2);Text(direction.title).font(.title3.bold());Text(direction.detail).font(.subheadline) }
                                        Spacer();Image(systemName:profile.direction == direction ? "checkmark.circle.fill":"circle")
                                    }.padding(20).background(profile.direction == direction ? Palette.sage : .white,in:RoundedRectangle(cornerRadius:22))
                                }.buttonStyle(.plain)
                            }
                        case 1:
                            ForEach(["吃得更均衡","让下一餐更省心","照顾训练和恢复","规律吃饭，减少纠结"],id:\.self) { focus in
                                Button {profile.focus=focus} label: { HStack {Text(focus);Spacer();Image(systemName:profile.focus == focus ? "checkmark.circle.fill":"circle")}.card() }.buttonStyle(.plain)
                            }
                        case 2:
                            Text("仅用于粗略估算，不是健康评估。特殊健康情况可在「我的」中设置，届时仅保留饮食记录。").font(.footnote).foregroundStyle(.secondary)
                            Stepper("年龄：\(profile.age) 岁",value:$profile.age,in:13...100)
                            HStack {Text("身高 cm");TextField("身高",value:$profile.heightCm,format:.number).keyboardType(.decimalPad).multilineTextAlignment(.trailing)}.card()
                            HStack {Text("体重 kg");TextField("体重",value:$profile.weightKg,format:.number).keyboardType(.decimalPad).multilineTextAlignment(.trailing)}.card()
                            Picker("估算系数",selection:$profile.sex) {Text("不提供").tag("unspecified");Text("女性").tag("female");Text("男性").tag("male")}.pickerStyle(.segmented)
                        case 3:
                            ForEach(["low","moderate","high"],id:\.self) { activity in
                                Button {profile.activity=activity} label: { HStack {Text(["low":"大多坐着，偶尔走动","moderate":"经常走动，规律轻运动","high":"运动较多或体力工作"][activity]!);Spacer();Image(systemName:profile.activity == activity ? "checkmark.circle.fill":"circle")}.card() }.buttonStyle(.plain)
                            }
                        default:
                            Text("之后随时可以调整。我们会先请你确认过敏与忌口，再给出食物建议。").foregroundStyle(.secondary)
                            DatePicker("今天起床",selection:$wake,displayedComponents:[.date,.hourAndMinute])
                            DatePicker("预计睡觉",selection:$sleep,displayedComponents:[.date,.hourAndMinute])
                            Text("夜班或跨午夜作息也可以直接选择真实日期。").font(.footnote)
                        }
                    }.padding(.vertical,4)
                }
                if !store.pending.isEmpty { Text("设置已保存在本机，联网后点下面重试。").font(.footnote); Button("重新同步") {Task {await store.sync();await store.reload()}} }
                Button(busy ? "正在保存…" : step<4 ? "继续" : "开启今天") {
                    if step<4 {step+=1}
                    else { busy=true; Task { await store.onboarding(profile,context:DayContext(wakeAt:Timestamp.string(wake),sleepAt:Timestamp.string(sleep))); busy=false } }
                }.buttonStyle(PrimaryButton()).accessibilityIdentifier("onboardingNext").disabled(busy || !valid)
            }.padding(24)
        }
    }
    private var valid:Bool {
        if step==2 {return (100...230).contains(profile.heightCm) && (25...250).contains(profile.weightKg)}
        if step==4 {return (4*3600...24*3600).contains(sleep.timeIntervalSince(wake))}
        return true
    }
}
