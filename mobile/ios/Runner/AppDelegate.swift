import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  /// The system's "save as" of a download (plan 25, B-26) — kept here, so the Xcode project needs no
  /// new file.
  private let save = SaveChannel()

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "RemoteClaudeSave") {
      save.attach(to: registrar.messenger())
    }
  }
}

/// The platform's end of `remote_claude/save` on iOS — the document picker in export mode (plan 25,
/// B-26, D-14). The person chooses where; the app's temporary file is copied there. Deleting the
/// temporary is the Dart side's, in every outcome.
final class SaveChannel: NSObject, UIDocumentPickerDelegate {
  private var pending: FlutterResult?

  func attach(to messenger: FlutterBinaryMessenger) {
    FlutterMethodChannel(name: "remote_claude/save", binaryMessenger: messenger)
      .setMethodCallHandler { [weak self] call, result in
        self?.handle(call, result: result)
      }
  }

  private func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard call.method == "save" else {
      result(FlutterMethodNotImplemented)
      return
    }
    guard
      let arguments = call.arguments as? [String: Any],
      let path = arguments["path"] as? String,
      let name = arguments["name"] as? String,
      !path.isEmpty, !name.isEmpty
    else {
      result(FlutterError(code: "SAVE_INVALID", message: "no file to save", details: nil))
      return
    }
    guard pending == nil else {
      result(FlutterError(code: "SAVE_BUSY", message: "a save is already asking where", details: nil))
      return
    }
    guard let presenter = Self.topController() else {
      result(FlutterError(code: "SAVE_FAILED", message: "nothing to present the picker from", details: nil))
      return
    }

    // The picker shows the file by its name: the temporary is copied under the name first.
    let source = URL(fileURLWithPath: path)
    let named = source.deletingLastPathComponent().appendingPathComponent(
      (name as NSString).lastPathComponent)
    do {
      if named != source {
        try? FileManager.default.removeItem(at: named)
        try FileManager.default.copyItem(at: source, to: named)
      }
    } catch {
      result(FlutterError(code: "SAVE_FAILED", message: error.localizedDescription, details: nil))
      return
    }

    pending = result
    let picker = UIDocumentPickerViewController(forExporting: [named], asCopy: true)
    picker.delegate = self
    presenter.present(picker, animated: true)
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    pending?("saved")
    pending = nil
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    pending?("cancelled")
    pending = nil
  }

  private static func topController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    var top = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
    while let presented = top?.presentedViewController {
      top = presented
    }
    return top
  }
}

