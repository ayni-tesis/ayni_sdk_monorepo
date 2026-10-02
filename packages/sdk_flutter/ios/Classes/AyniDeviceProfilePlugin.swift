import Flutter
import UIKit

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
    guard call.method == "getRuntimeProfile" else {
      result(FlutterMethodNotImplemented)
      return
    }
    result(["totalMemoryBytes": Int64(ProcessInfo.processInfo.physicalMemory)])
  }
}
