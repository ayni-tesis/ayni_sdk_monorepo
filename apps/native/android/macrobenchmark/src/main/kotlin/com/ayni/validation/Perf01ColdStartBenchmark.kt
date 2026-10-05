package com.ayni.validation

import android.content.ComponentName
import android.content.Intent
import androidx.benchmark.macro.ExperimentalMetricApi
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.StartupTimingMetric
import androidx.benchmark.macro.TraceSectionMetric
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.UiScrollable
import androidx.test.uiautomator.UiSelector
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@OptIn(ExperimentalMetricApi::class)
class Perf01ColdStartBenchmark {
    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun controlColdStart() = runColdStart("control")

    @Test
    fun treatmentColdStart() = runColdStart("treatment")

    private fun runColdStart(condition: String) {
        benchmarkRule.measureRepeated(
            packageName = TARGET_PACKAGE,
            metrics = listOf(
                StartupTimingMetric(),
                TraceSectionMetric(COLD_START_SECTION),
                TraceSectionMetric(FIRST_INFERENCE_SECTION),
            ),
            iterations = ITERATIONS,
            startupMode = StartupMode.COLD,
            setupBlock = { pressHome() },
        ) {
            val currentIteration = iteration ?: return@measureRepeated
            val label = "PERF-01-${(currentIteration + 1).toString().padStart(3, '0')}"
            val launchIntent = Intent(Intent.ACTION_MAIN).apply {
                component = ComponentName(TARGET_PACKAGE, TARGET_ACTIVITY)
                addCategory(Intent.CATEGORY_LAUNCHER)
                putExtra(CONDITION_EXTRA, condition)
                putExtra(RUN_LABEL_EXTRA, label)
            }
            startActivityAndWait(launchIntent)

            val result = UiScrollable(UiSelector().scrollable(true))
                .setAsVerticalList()
                .scrollIntoView(UiSelector().textContains(label))
            checkNotNull(result) { "$label did not finish on the app." }
        }
    }

    private companion object {
        const val TARGET_PACKAGE = "com.example.better_fullstack_app"
        const val TARGET_ACTIVITY = "$TARGET_PACKAGE.MainActivity"
        const val ITERATIONS = 30
        const val CONDITION_EXTRA = "ayni_validation_condition"
        const val RUN_LABEL_EXTRA = "ayni_validation_run_label"
        const val COLD_START_SECTION =
            "AyniValidation.Perf01.ColdStartToFirstInference"
        const val FIRST_INFERENCE_SECTION =
            "AyniValidation.Perf01.FirstInference"
    }
}
