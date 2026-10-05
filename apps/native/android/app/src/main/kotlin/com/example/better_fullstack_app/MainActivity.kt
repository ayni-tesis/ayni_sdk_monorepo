package com.example.better_fullstack_app

import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "ayni_validation/run_metadata")
            .setMethodCallHandler { call, result ->
                if (call.method != "read") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                val appVersion = packageManager.getPackageInfo(packageName, 0).versionName
                result.success(
                    mapOf(
                        "deviceModel" to Build.MODEL,
                        "platform" to "android",
                        "osVersion" to Build.VERSION.RELEASE,
                        "apiLevel" to Build.VERSION.SDK_INT,
                        "appVersion" to appVersion,
                    ),
                )
            }
    }
}
