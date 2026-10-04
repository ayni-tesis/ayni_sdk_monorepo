package dev.ayni.ayni_sdk

import android.app.ActivityManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class AyniDeviceProfilePlugin : FlutterPlugin, MethodChannel.MethodCallHandler {
    private lateinit var channel: MethodChannel
    private lateinit var networkChannel: MethodChannel
    private lateinit var context: Context

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        channel = MethodChannel(binding.binaryMessenger, "dev.ayni.ayni_sdk/device_profile")
        channel.setMethodCallHandler(this)
        networkChannel = MethodChannel(binding.binaryMessenger, "dev.ayni.ayni_sdk/network")
        networkChannel.setMethodCallHandler(this)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
        networkChannel.setMethodCallHandler(null)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "getDeviceProfile" -> result.success(deviceProfile())
            "getNetworkType" -> result.success(networkType())
            else -> result.notImplemented()
        }
    }

    private fun deviceProfile(): Map<String, Any> {
        val memoryInfo = ActivityManager.MemoryInfo()
        (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager)
            .getMemoryInfo(memoryInfo)
        val profile = mutableMapOf<String, Any>(
            "platform" to "android",
            "osVersion" to Build.VERSION.RELEASE,
            "apiLevel" to Build.VERSION.SDK_INT,
            "model" to Build.MODEL,
            "totalMemoryBytes" to memoryInfo.totalMem,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && Build.SOC_MODEL.isNotBlank()) {
            profile["socModel"] = Build.SOC_MODEL
        }
        return profile
    }

    /**
     * The transport of the default network (US-069): "wifi", "cellular", "other" or "none".
     * Reading it needs ACCESS_NETWORK_STATE, which this plugin's manifest declares; without
     * it, the answer is "other", which never counts as Wi-Fi.
     */
    private fun networkType(): String {
        return try {
            val connectivity =
                context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                    ?: return "other"
            val network = connectivity.activeNetwork ?: return "none"
            val capabilities = connectivity.getNetworkCapabilities(network) ?: return "none"
            when {
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
                else -> "other"
            }
        } catch (error: SecurityException) {
            "other"
        }
    }
}
