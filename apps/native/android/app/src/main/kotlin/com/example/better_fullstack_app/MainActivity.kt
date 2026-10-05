package com.example.better_fullstack_app

import android.os.Build
import android.os.Bundle
import android.os.Trace
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var coldStartTraceOpen = false
    private var inferenceTraceOpen = false

    private fun perf01Route(): String? {
        if (BuildConfig.BUILD_TYPE != "benchmark") return null
        val condition = intent.getStringExtra("ayni_validation_condition") ?: return null
        val runLabel = intent.getStringExtra("ayni_validation_run_label") ?: return null
        if (condition !in setOf("control", "treatment")) return null
        if (!Regex("^PERF-01-(?:00[1-9]|0[12][0-9]|030)$").matches(runLabel)) {
            return null
        }
        return "/__ayni_lab/perf-01/$condition/$runLabel"
    }

    override fun getInitialRoute(): String? = perf01Route() ?: super.getInitialRoute()

    override fun onCreate(savedInstanceState: Bundle?) {
        if (savedInstanceState == null && perf01Route() != null) {
            Trace.beginSection("AyniValidation.Perf01.ColdStartToFirstInference")
            coldStartTraceOpen = true
        }
        super.onCreate(savedInstanceState)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "ayni_validation/performance_trace",
        ).setMethodCallHandler { call, result ->
            if (BuildConfig.BUILD_TYPE != "benchmark") {
                result.notImplemented()
                return@setMethodCallHandler
            }
            when (call.method) {
                "beginSection" -> {
                    if (call.arguments != "AyniValidation.Perf01.FirstInference") {
                        result.error("invalidSection", "Sección de medición desconocida.", null)
                        return@setMethodCallHandler
                    }
                    if (!inferenceTraceOpen) {
                        Trace.beginSection("AyniValidation.Perf01.FirstInference")
                        inferenceTraceOpen = true
                    }
                    result.success(null)
                }

                "endSection" -> {
                    if (inferenceTraceOpen) {
                        Trace.endSection()
                        inferenceTraceOpen = false
                    }
                    result.success(null)
                }

                "finishColdStart" -> {
                    if (coldStartTraceOpen) {
                        Trace.endSection()
                        coldStartTraceOpen = false
                    }
                    result.success(null)
                }

                else -> result.notImplemented()
            }
        }
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
