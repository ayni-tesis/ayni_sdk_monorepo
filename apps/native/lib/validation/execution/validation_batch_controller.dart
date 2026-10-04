import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

import '../data/dataset_bundle_loader.dart';
import '../models/experiment_plan.dart';
import '../models/validation_run_record.dart';
import '../storage/validation_jsonl_store.dart';
import 'validation_condition_runner.dart';

class ValidationBatchController {
  ValidationBatchController({required ValidationJsonlStore store})
    : _store = store;

  final ValidationJsonlStore _store;
  ValidationConditionRunner? _activeRunner;
  bool _cancelRequested = false;

  Future<BatchRunSummary> runPhase({
    required ExperimentPlan plan,
    required String pairRunId,
    required ValidationConditionRunner runner,
    required VerifiedDataset dataset,
    required String scenarioId,
    required ValidationPhase phase,
    required Future<bool> Function() isCancelled,
    required void Function(ValidationRunRecord) onRecord,
    bool captureTrace = false,
  }) async {
    if (_activeRunner != null) {
      throw const ValidationBatchException(
        'batchAlreadyRunning',
        'Ya hay un lote en ejecución.',
      );
    }
    if (pairRunId.trim().isEmpty) {
      throw const ValidationBatchException(
        'invalidRunId',
        'Ingresa un identificador para esta corrida pareada.',
      );
    }
    final scenarios = plan.scenarios
        .where(
          (candidate) => candidate.id == scenarioId && candidate.phase == phase,
        )
        .toList();
    if (scenarios.length != 1) {
      throw const ValidationBatchException(
        'scenarioNotFound',
        'El escenario no corresponde a la fase seleccionada.',
      );
    }
    final scenario = scenarios.single;
    if (scenario.requiresExternalMeasurement ||
        phase == ValidationPhase.coldStart) {
      throw const ValidationBatchException(
        'externalMeasurementRequired',
        'PERF-01 requiere la medición externa indicada por el Plan.',
      );
    }
    final cases = _casesFor(plan, scenario, dataset);
    _activeRunner = runner;
    _cancelRequested = false;
    var cancellationCheckInProgress = false;
    final cancellationPoller = Timer.periodic(
      const Duration(milliseconds: 50),
      (_) {
        if (cancellationCheckInProgress || _cancelRequested) return;
        cancellationCheckInProgress = true;
        unawaited(() async {
          try {
            if (await isCancelled()) await cancel();
          } finally {
            cancellationCheckInProgress = false;
          }
        }());
      },
    );

    var attempted = 0;
    var successes = 0;
    var errors = 0;
    var cancelled = 0;
    final completedBlocks = <int>[];
    var nextBlockIndex = 0;
    var nextBlockEnd = scenario.blockSizes.first;
    try {
      for (var index = 0; index < scenario.repetitions; index++) {
        if (_cancelRequested || await isCancelled()) {
          await cancel();
          break;
        }
        final selectedCase = cases[index % cases.length];
        final bytes = await _readVerifiedImage(selectedCase);
        final inputHash = sha256.convert(bytes).toString();
        final request = ValidationRunRequest(
          pairRunId: pairRunId,
          repetition: index + 1,
          phase: phase,
          scenarioId: scenario.id,
          caseId: selectedCase.caseId,
          datasetId: dataset.datasetId,
          datasetVersionId: dataset.datasetVersionId,
          datasetPartition: dataset.partition,
          datasetSha256: dataset.zipSha256,
          inputBytes: bytes,
          inputSha256: inputHash,
          captureTrace: captureTrace,
        );

        final stopwatch = Stopwatch()..start();
        ConditionRunResult result;
        try {
          result = await runner.runCase(request);
        } on Object {
          stopwatch.stop();
          final profile = plan.activeResourceProfile;
          result = ConditionRunResult.failure(
            durationMicros: stopwatch.elapsedMicroseconds,
            modelVersionId: runner.condition == ValidationCondition.control
                ? profile.controlModelVersionId
                : profile.treatmentModelVersionId,
            modelSha256: runner.condition == ValidationCondition.control
                ? profile.controlModelSha256
                : profile.treatmentModelSha256,
            workflowVersionId: runner.condition == ValidationCondition.treatment
                ? profile.treatmentWorkflowVersionId
                : null,
            workflowVersion: runner.condition == ValidationCondition.treatment
                ? profile.treatmentWorkflowVersion
                : null,
            errorCode: 'runnerFailure',
            errorMessage: 'No se pudo completar esta ejecución local.',
          );
        }
        final cancelledDuringRun = _cancelRequested || await isCancelled();
        if (cancelledDuringRun && !_cancelRequested) await cancel();
        if (cancelledDuringRun &&
            result.outcome != ValidationRunOutcome.cancelled) {
          result = ConditionRunResult.cancelled(
            durationMicros: result.durationMicros,
            modelVersionId: result.modelVersionId,
            modelSha256: result.modelSha256,
            workflowVersionId: result.workflowVersionId,
            workflowVersion: result.workflowVersion,
            tracePersistenceFailed: result.tracePersistenceFailed,
          );
        }
        final record = ValidationRunRecord(
          pairRunId: pairRunId,
          repetition: index + 1,
          condition: runner.condition,
          phase: phase,
          scenarioId: scenario.id,
          caseId: selectedCase.caseId,
          datasetVersionId: dataset.datasetVersionId,
          datasetPartition: dataset.partition,
          datasetSha256: dataset.zipSha256,
          inputSha256: inputHash,
          modelVersionId: result.modelVersionId,
          modelSha256: result.modelSha256,
          workflowVersionId: result.workflowVersionId,
          workflowVersion: result.workflowVersion,
          backend: 'CPU',
          durationMicros: result.durationMicros,
          outcome: result.outcome,
          normalizedOutput: result.normalizedOutput,
          tracePersistenceFailed: result.tracePersistenceFailed,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        );
        await _store.append(record);
        onRecord(record);
        attempted++;
        switch (record.outcome) {
          case ValidationRunOutcome.success:
            successes++;
          case ValidationRunOutcome.error:
            errors++;
          case ValidationRunOutcome.cancelled:
            cancelled++;
        }
        if (attempted == nextBlockEnd) {
          completedBlocks.add(scenario.blockSizes[nextBlockIndex]);
          nextBlockIndex++;
          if (nextBlockIndex < scenario.blockSizes.length) {
            nextBlockEnd += scenario.blockSizes[nextBlockIndex];
          }
        }
        if (cancelledDuringRun || _cancelRequested) break;
      }
    } finally {
      cancellationPoller.cancel();
      _activeRunner = null;
      _cancelRequested = false;
    }
    return BatchRunSummary(
      attempted: attempted,
      successes: successes,
      errors: errors,
      cancelled: cancelled,
      completedBlockSizes: completedBlocks,
      stoppedByCancellation: cancelled > 0 || attempted < scenario.repetitions,
    );
  }

  Future<void> cancel() async {
    final runner = _activeRunner;
    if (runner == null || _cancelRequested) return;
    _cancelRequested = true;
    await runner.cancelActive();
  }

  List<VerifiedDatasetCase> _casesFor(
    ExperimentPlan plan,
    ValidationScenario scenario,
    VerifiedDataset dataset,
  ) {
    final requestedIds = scenario.caseIds.isNotEmpty
        ? scenario.caseIds
        : plan.caseIds;
    if (requestedIds.isNotEmpty) {
      final byId = {
        for (final datasetCase in dataset.cases)
          datasetCase.caseId: datasetCase,
      };
      if (requestedIds.any((id) => !byId.containsKey(id))) {
        throw const ValidationBatchException(
          'datasetCasesUnavailable',
          'El dataset verificado no contiene todos los casos del escenario.',
        );
      }
      return List.unmodifiable(requestedIds.map((id) => byId[id]!));
    }
    final caseScenarioId = scenario.phase == ValidationPhase.warmup
        ? plan.scenarioFor(ValidationPhase.measured).id
        : scenario.id;
    final matching = dataset.cases
        .where((datasetCase) => datasetCase.scenario == caseScenarioId)
        .toList(growable: false);
    if (matching.isEmpty) {
      throw const ValidationBatchException(
        'datasetCasesUnavailable',
        'No hay imágenes verificadas para el escenario seleccionado.',
      );
    }
    return List.unmodifiable(matching);
  }

  Future<Uint8List> _readVerifiedImage(VerifiedDatasetCase datasetCase) async {
    final file = File(datasetCase.localPath);
    if (!await file.exists()) {
      throw const ValidationBatchException(
        'datasetImageUnavailable',
        'Una imagen del dataset verificado ya no está disponible.',
      );
    }
    final bytes = await file.readAsBytes();
    if (sha256.convert(bytes).toString() != datasetCase.sha256) {
      throw const ValidationBatchException(
        'datasetImageChanged',
        'Una imagen cambió desde que se verificó el dataset; vuelve a prepararlo.',
      );
    }
    return Uint8List.fromList(bytes);
  }
}

class BatchRunSummary {
  BatchRunSummary({
    required this.attempted,
    required this.successes,
    required this.errors,
    required this.cancelled,
    required List<int> completedBlockSizes,
    required this.stoppedByCancellation,
  }) : completedBlockSizes = List.unmodifiable(completedBlockSizes);

  final int attempted;
  final int successes;
  final int errors;
  final int cancelled;
  final List<int> completedBlockSizes;
  final bool stoppedByCancellation;
}

class ValidationBatchException implements Exception {
  const ValidationBatchException(this.code, this.message);

  final String code;
  final String message;

  @override
  String toString() => '$code: $message';
}
