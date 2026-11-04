package dev.ayni.ayni_sdk

import android.app.ActivityManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Handler
import android.os.Looper
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.StandardMethodCodec
import java.io.File
import java.security.MessageDigest

class AyniDeviceProfilePlugin : FlutterPlugin, MethodChannel.MethodCallHandler {
    private lateinit var channel: MethodChannel
    private lateinit var networkChannel: MethodChannel
    private lateinit var digestChannel: MethodChannel
    private lateinit var context: Context

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        channel = MethodChannel(binding.binaryMessenger, "dev.ayni.ayni_sdk/device_profile")
        channel.setMethodCallHandler(this)
        networkChannel = MethodChannel(binding.binaryMessenger, "dev.ayni.ayni_sdk/network")
        networkChannel.setMethodCallHandler(this)
        digestChannel = MethodChannel(
            binding.binaryMessenger,
            "dev.ayni.ayni_sdk/file_digest",
            StandardMethodCodec.INSTANCE,
            binding.binaryMessenger.makeBackgroundTaskQueue(),
        )
        digestChannel.setMethodCallHandler { call, result ->
            if (call.method != "sha256File") {
                result.notImplemented()
            } else {
                val path = call.argument<String>("path")
                try {
                    requireNotNull(path)
                    val digest = MessageDigest.getInstance("SHA-256")
                    File(path).inputStream().buffered(65536).use { input ->
                        val buffer = ByteArray(65536)
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            digest.update(buffer, 0, read)
                        }
                    }
                    val hex = digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
                    Handler(Looper.getMainLooper()).post { result.success(hex) }
                } catch (_: Exception) {
                    Handler(Looper.getMainLooper()).post { result.error("digest_failed", null, null) }
                }
            }
        }
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
        networkChannel.setMethodCallHandler(null)
        digestChannel.setMethodCallHandler(null)
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
