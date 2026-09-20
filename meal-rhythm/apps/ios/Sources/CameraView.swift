import SwiftUI
import AVFoundation
import UIKit

// All capture-session mutations stay on one serial queue. Only JPEG Data crosses to UI.
final class CameraSession:NSObject,AVCapturePhotoCaptureDelegate,@unchecked Sendable {
    let session=AVCaptureSession()
    private let queue=DispatchQueue(label:"MealRhythm.camera")
    private let output=AVCapturePhotoOutput()
    private let result:@Sendable(Data?,String?)->Void
    init(result:@escaping @Sendable(Data?,String?)->Void) {self.result=result}
    func start() {queue.async { [self] in
        do {
            if session.inputs.isEmpty {
                session.beginConfiguration();defer {session.commitConfiguration()}
                session.sessionPreset = .photo
                guard let device=AVCaptureDevice.default(.builtInWideAngleCamera,for:.video,position:.back) else {result(nil,"此设备没有可用相机，可以从相册选择或手动记录。");return}
                let input=try AVCaptureDeviceInput(device:device)
                guard session.canAddInput(input),session.canAddOutput(output) else {result(nil,"无法开启相机，请使用相册或手动记录。");return}
                session.addInput(input);session.addOutput(output)
            }
            session.startRunning()
        } catch {result(nil,error.localizedDescription)}
    }}
    func stop() {queue.async { [self] in if session.isRunning {session.stopRunning()} }}
    func capture() {queue.async { [self] in
        guard session.isRunning else {result(nil,"相机还未就绪，请稍后再试。");return}
        output.capturePhoto(with:AVCapturePhotoSettings(),delegate:self)
    }}
    func photoOutput(_ output:AVCapturePhotoOutput,didFinishProcessingPhoto photo:AVCapturePhoto,error:Error?) {result(photo.fileDataRepresentation(),error?.localizedDescription)}
}
@MainActor final class CameraController:UIViewController {
    var completion:((Data?,String?)->Void)?
    private var camera:CameraSession?
    private var preview:AVCaptureVideoPreviewLayer?
    override func viewDidLoad() {
        super.viewDidLoad();view.backgroundColor = .black
        let engine=CameraSession { [weak self] data,error in Task { @MainActor [weak self] in self?.completion?(data,error) } };camera=engine
        let layer=AVCaptureVideoPreviewLayer(session:engine.session);layer.videoGravity = .resizeAspectFill;view.layer.addSublayer(layer);preview=layer
        let shutter=UIButton(type:.system);shutter.setImage(UIImage(systemName:"circle.inset.filled",withConfiguration:UIImage.SymbolConfiguration(pointSize:70)),for:.normal);shutter.tintColor = .white;shutter.accessibilityLabel="拍摄餐食";shutter.translatesAutoresizingMaskIntoConstraints=false
        shutter.addAction(UIAction { [weak self] _ in
            Task { @MainActor [weak self] in self?.camera?.capture() }
        },for:.touchUpInside)
        view.addSubview(shutter)
        NSLayoutConstraint.activate([shutter.centerXAnchor.constraint(equalTo:view.centerXAnchor),shutter.bottomAnchor.constraint(equalTo:view.safeAreaLayoutGuide.bottomAnchor,constant:-24),shutter.heightAnchor.constraint(equalToConstant:88),shutter.widthAnchor.constraint(equalToConstant:88)])
        Task { [weak self] in
            let granted=await AVCaptureDevice.requestAccess(for:.video)
            guard let self,self.viewIfLoaded?.window != nil else {return}
            if granted {self.camera?.start()} else {self.completion?(nil,"相机权限未开启。可以从相册选图或直接手动记录。")}
        }
    }
    override func viewDidLayoutSubviews() {super.viewDidLayoutSubviews();preview?.frame=view.bounds}
    override func viewDidDisappear(_ animated:Bool) {super.viewDidDisappear(animated);camera?.stop()}
}
struct CameraView:UIViewControllerRepresentable {
    var completion:(Data?,String?)->Void
    func makeUIViewController(context:Context)->CameraController {let controller=CameraController();controller.completion=completion;return controller}
    func updateUIViewController(_ controller:CameraController,context:Context) {}
}
@MainActor enum ImagePreparer {
    static func jpeg(_ data:Data) throws -> Data {
        guard data.count<=30*1024*1024,let source=UIImage(data:data),source.size.width>0,source.size.height>0 else {throw APIError(status:400,code:"IMAGE_INVALID",message:"照片无效或超过 30 MB，请换一张。")}
        let scale=min(1,1600/max(source.size.width,source.size.height))
        let size=CGSize(width:source.size.width*scale,height:source.size.height*scale)
        let format=UIGraphicsImageRendererFormat();format.scale=1;format.opaque=true
        // Redrawing fixes orientation and creates a fresh JPEG without GPS/EXIF metadata.
        let result=UIGraphicsImageRenderer(size:size,format:format).jpegData(withCompressionQuality:0.8) { context in UIColor.white.setFill();context.fill(CGRect(origin:.zero,size:size));source.draw(in:CGRect(origin:.zero,size:size)) }
        guard result.count<=8*1024*1024 else {throw APIError(status:400,code:"IMAGE_LARGE",message:"照片压缩后仍过大，请换一张。")}
        return result
    }
}
