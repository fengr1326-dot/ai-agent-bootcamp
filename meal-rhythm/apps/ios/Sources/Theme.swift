import SwiftUI

enum Palette {
    static let background=Color(red:0.97,green:0.96,blue:0.92)
    static let forest=Color(red:0.16,green:0.29,blue:0.22)
    static let sage=Color(red:0.86,green:0.90,blue:0.80)
    static let ink=Color(red:0.17,green:0.22,blue:0.18)
    static let clay=Color(red:0.64,green:0.34,blue:0.23)
}
struct PrimaryButton: ButtonStyle {
    func makeBody(configuration:Configuration)->some View {
        configuration.label.font(.headline).frame(maxWidth:.infinity).padding(17)
            .foregroundStyle(.white).background(Palette.forest,in:RoundedRectangle(cornerRadius:18))
            .opacity(configuration.isPressed ? 0.75 : 1)
    }
}
struct SectionTitle: View {
    let eyebrow:String; let title:String
    var body:some View { VStack(alignment:.leading,spacing:7) { Text(eyebrow).font(.caption.weight(.semibold)).tracking(2).foregroundStyle(Palette.forest); Text(title).font(.title2.weight(.semibold)).foregroundStyle(Palette.ink) } }
}
extension View {
    func card() -> some View { self.padding(20).frame(maxWidth:.infinity,alignment:.leading).background(.white.opacity(0.85),in:RoundedRectangle(cornerRadius:24)) }
}
