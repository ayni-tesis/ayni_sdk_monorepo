import Flutter
import UIKit
import Darwin
import Network

public class AyniDeviceProfilePlugin: NSObject, FlutterPlugin {
  public static func register(with registrar: FlutterPluginRegistrar) {
    let instance = AyniDeviceProfilePlugin()
    let channel = FlutterMethodChannel(
      name: "dev.ayni.ayni_sdk/device_profile",
      binaryMessenger: registrar.messenger()
    )
    registrar.addMethodCallDelegate(instance, channel: channel)
    let networkChannel = FlutterMethodChannel(
      name: "dev.ayni.ayni_sdk/network",
      binaryMessenger: registrar.messenger()
    )
    registrar.addMethodCallDelegate(instance, channel: networkChannel)
  }

  public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "getDeviceProfile":
      result(deviceProfile())
    case "getNetworkType":
      networkType(result: result)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private func deviceProfile() -> [String: Any] {
    let model: String
    #if targetEnvironment(simulator)
      model = UIDevice.current.model
    #else
      var systemInfo = utsname()
      uname(&systemInfo)
      let machineSize = MemoryLayout.size(ofValue: systemInfo.machine)
      model = withUnsafePointer(to: &systemInfo.machine) {
        $0.withMemoryRebound(
          to: CChar.self,
          capacity: machineSize
        ) { String(cString: $0) }
      }
    #endif
    return [
      "platform": "ios",
      "osVersion": UIDevice.current.systemVersion,
      "model": model,
      "totalMemoryBytes": Int64(ProcessInfo.processInfo.physicalMemory),
    ]
  }

  /// Answers the interface of the current path (US-069): "wifi", "cellular",
  /// "other" or "none". Before iOS 12, which has no NWPathMonitor, or when no
  /// path arrives within two seconds, it answers "other", which never counts
  /// as Wi-Fi.
  private func networkType(result: @escaping FlutterResult) {
    guard #available(iOS 12.0, *) else {
      result("other")
      return
    }
    let monitor = NWPathMonitor()
    let queue = DispatchQueue(label: "dev.ayni.ayni_sdk.network")
    // Both the handler and the timeout run on this serial queue, so this flag
    // makes the first of them answer once and release the monitor.
    var answered = false
    func answer(_ type: String) {
      guard !answered else { return }
      answered = true
      monitor.pathUpdateHandler = nil
      monitor.cancel()
      DispatchQueue.main.async { result(type) }
    }
    monitor.pathUpdateHandler = { path in
      if path.status != .satisfied {
        answer("none")
      } else if path.usesInterfaceType(.wifi) {
        answer("wifi")
      } else if path.usesInterfaceType(.cellular) {
        answer("cellular")
      } else {
        answer("other")
      }
    }
    monitor.start(queue: queue)
    queue.asyncAfter(deadline: .now() + 2) { answer("other") }
  }
}
