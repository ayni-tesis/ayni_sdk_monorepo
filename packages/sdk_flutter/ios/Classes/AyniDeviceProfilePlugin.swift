import Flutter
import UIKit
import Darwin

public class AyniDeviceProfilePlugin: NSObject, FlutterPlugin {
  public static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(
      name: "dev.ayni.ayni_sdk/device_profile",
      binaryMessenger: registrar.messenger()
    )
    let instance = AyniDeviceProfilePlugin()
    registrar.addMethodCallDelegate(instance, channel: channel)
  }

  public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard call.method == "getDeviceProfile" else {
      result(FlutterMethodNotImplemented)
      return
    }
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
    result([
      "platform": "ios",
      "osVersion": UIDevice.current.systemVersion,
      "model": model,
      "totalMemoryBytes": Int64(ProcessInfo.processInfo.physicalMemory),
    ])
  }
}
