import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

import '../data/dataset_bundle_loader.dart';
import '../models/experiment_plan.dart';
import '../models/validation_run_metadata.dart';
import '../models/validation_run_record.dart';
import '../storage/validation_jsonl_store.dart';
import '../validation_performance_trace.dart';
import 'validation_condition_runner.dart';

class ValidationBatchController {
  static const quickRunPercentage = 20;

  static int repetitionsFor(
    ValidationScenario scenario, {
    required bool quickRun,
  }) => quickRun
      ? (scenario.repetitions * quickRunPercentage + 99) ~/ 100
      : scenario.repetitions;

  ValidationBatchController({
    required ValidationJsonlStore store,
    required ValidationRunMetadata metadata,
    Future<List<int>> Function(String path)? readBytes,
    ValidationPerformanceTrace? performanceTrace,
  }) : _store = store,
       _metadata = metadata,
       _readBytes = readBytes ?? _readFileBytes,
       _performanceTrace =
           performanceTrace ?? const ValidationPerformanceTrace(enabled: false);

  final ValidationJsonlStore _store;
  final ValidationRunMetadata _metadata;
  final Future<List<int>> Function(String path) _readBytes;
  final ValidationPerformanceTrace _performanceTrace;
  ValidationConditionRunner? _activeRunner;
  bool _cancelRequested = false;

  Future<BatchRunSummary> runPhase({
    required ExperimentPlan plan,
    required String pairRunId,
    required ValidationConditionRunner runner,
    required VerifiedDataset dataset,
    required String scenarioId,
    required ValidationPhase phase,
    String? coldStartRunLabel,
    int? repetitionLimit,
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
    final profile = _profileForScenario(plan, scenario);
    final coldStartLabelIndex = coldStartRunLabel == null
        ? -1
        : scenario.runLabels.indexOf(coldStartRunLabel);
    if (phase == ValidationPhase.coldStart
        ? !scenario.requiresExternalMeasurement || coldStartLabelIndex < 0
        : scenario.requiresExternalMeasurement || coldStartRunLabel != null) {
      throw const ValidationBatchException(
        'externalMeasurementRequired',
        'PERF-01 requiere una etiqueta del benchmark externo indicada por el Plan.',
      );
    }
    final cases = _casesFor(plan, scenario, dataset);
    final repetitions = phase == ValidationPhase.coldStart
        ? 1
        : repetitionLimit ?? scenario.repetitions;
    if (repetitions < 1 || repetitions > scenario.repetitions) {
      throw const ValidationBatchException(
        'invalidRepetitionLimit',
        'El límite de intentos debe estar dentro del escenario.',
      );
    }
    final blockSizes = repetitionLimit == null
        ? scenario.blockSizes
        : [repetitions];
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
    var nextBlockEnd = blockSizes.first;
    try {
      for (var index = 0; index < repetitions; index++) {
        if (_cancelRequested || await isCancelled()) {
          await cancel();
          break;
        }
        final selectedCase = repetitionLimit == null
            ? cases[index % cases.length]
            : cases[(index * cases.length ~/ repetitions).clamp(
                0,
                cases.length - 1,
              )];
        final bytes = await _readVerifiedImage(selectedCase);
        if (_cancelRequested || await isCancelled()) {
          await cancel();
          break;
        }
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
          result = phase == ValidationPhase.coldStart
              ? await _performanceTrace.measure(
                  ValidationPerformanceTrace.firstInference,
                  () => runner.runCase(request),
                )
              : await runner.runCase(request);
        } on Object {
          stopwatch.stop();
          final model = profile.modelRequirements.first;
          result = ConditionRunResult.failure(
            durationMicros: stopwatch.elapsedMicroseconds,
            modelVersionId: model.modelVersionId,
            modelSha256: model.sha256,
            modelArtifacts: [
              for (final requirement in profile.modelRequirements)
                ValidationRunModelArtifact(
                  nodeId: requirement.nodeId,
                  modelVersionId: requirement.modelVersionId,
                  sha256: requirement.sha256,
                ),
            ],
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
        if (phase == ValidationPhase.coldStart) {
          await _performanceTrace.finishColdStart();
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
            modelArtifacts: result.modelArtifacts,
            tracePersistenceFailed: result.tracePersistenceFailed,
          );
        }
        final record = ValidationRunRecord(
          pairRunId: pairRunId,
          repetition: phase == ValidationPhase.coldStart
              ? coldStartLabelIndex + 1
              : index + 1,
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
          modelArtifacts: result.modelArtifacts,
          workflowVersionId: result.workflowVersionId,
          workflowVersion: result.workflowVersion,
          backend: 'CPU',
          metadata: _metadata,
          durationMicros: result.durationMicros,
          outcome: result.outcome,
          normalizedOutput: result.normalizedOutput,
          traceCaptureEnabled: captureTrace,
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
          completedBlocks.add(blockSizes[nextBlockIndex]);
          nextBlockIndex++;
          if (nextBlockIndex < blockSizes.length) {
            nextBlockEnd += blockSizes[nextBlockIndex];
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
      stoppedByCancellation: cancelled > 0 || attempted < repetitions,
    );
  }

  Future<BatchRunSummary> runSuite({
    required ExperimentPlan plan,
    required String pairRunId,
    required Map<String, VerifiedDataset> datasetsByProfileId,
    required Map<String, Map<ValidationCondition, ValidationConditionRunner>>
    runnersByProfileId,
    required List<ValidationCondition> conditions,
    bool quickRun = false,
    required bool captureTrace,
    required Future<bool> Function() isCancelled,
    required void Function(ValidationRunRecord) onRecord,
    required void Function(ValidationSuiteProgress) onProgress,
  }) async {
    if (pairRunId.trim().isEmpty) {
      throw const ValidationBatchException(
        'invalidRunId',
        'Ingresa un identificador para esta corrida pareada.',
      );
    }
    await preflightSuite(
      plan: plan,
      datasetsByProfileId: datasetsByProfileId,
      runnersByProfileId: runnersByProfileId,
      conditions: conditions,
    );
    final scenarios = _automaticScenarios(plan);
    final repetitionsByScenario = {
      for (final scenario in scenarios)
        scenario.id: repetitionsFor(scenario, quickRun: quickRun),
    };
    final totalAttempts = repetitionsByScenario.values.fold<int>(
      0,
      (total, repetitions) => total + repetitions * conditions.length,
    );
    var attempted = 0;
    var successes = 0;
    var errors = 0;
    var cancelled = 0;
    var completed = 0;
    var stopped = false;
    final completedBlocks = <int>[];

    for (final scenario in scenarios) {
      final profileId = scenario.resourceProfileId!;
      for (final condition in conditions) {
        if (await isCancelled()) {
          stopped = true;
          break;
        }
        final runner = runnersByProfileId[profileId]![condition]!;
        final phaseSummary = await runPhase(
          plan: plan,
          pairRunId: pairRunId,
          runner: runner,
          dataset: datasetsByProfileId[profileId]!,
          scenarioId: scenario.id,
          phase: scenario.phase,
          repetitionLimit: quickRun ? repetitionsByScenario[scenario.id] : null,
          captureTrace:
              condition == ValidationCondition.treatment && captureTrace,
          isCancelled: isCancelled,
          onRecord: (record) {
            onRecord(record);
            completed++;
            onProgress(
              ValidationSuiteProgress(
                completedAttempts: completed,
                totalAttempts: totalAttempts,
                profileId: profileId,
                scenarioId: scenario.id,
                phase: scenario.phase,
                condition: condition,
                caseId: record.caseId,
                repetition: record.repetition,
              ),
            );
          },
        );
        attempted += phaseSummary.attempted;
        successes += phaseSummary.successes;
        errors += phaseSummary.errors;
        cancelled += phaseSummary.cancelled;
        completedBlocks.addAll(phaseSummary.completedBlockSizes);
        if (phaseSummary.attempted > 0 && completed < attempted) {
          completed = attempted;
          onProgress(
            ValidationSuiteProgress(
              completedAttempts: completed,
              totalAttempts: totalAttempts,
              profileId: profileId,
              scenarioId: scenario.id,
              phase: scenario.phase,
              condition: condition,
            ),
          );
        }
        if (phaseSummary.stoppedByCancellation) {
          stopped = true;
          break;
        }
      }
      if (stopped) break;
    }
    return BatchRunSummary(
      attempted: attempted,
      successes: successes,
      errors: errors,
      cancelled: cancelled,
      completedBlockSizes: completedBlocks,
      stoppedByCancellation: stopped || attempted < totalAttempts,
    );
  }

  Future<void> preflightSuite({
    required ExperimentPlan plan,
    required Map<String, VerifiedDataset> datasetsByProfileId,
    required Map<String, Map<ValidationCondition, ValidationConditionRunner>>
    runnersByProfileId,
    required List<ValidationCondition> conditions,
  }) async {
    final scenarios = _automaticScenarios(plan);
    if (scenarios.isEmpty ||
        conditions.isEmpty ||
        conditions.toSet().length != conditions.length) {
      throw const ValidationBatchException(
        'invalidSuite',
        'El plan no define una suite automática verificable.',
      );
    }
    final profiles = <String, ValidationResourceProfile>{
      for (final profile in plan.resourceProfiles) profile.id: profile,
    };
    final requiredProfileIds = scenarios
        .map((scenario) => scenario.resourceProfileId!)
        .toSet();
    for (final profileId in requiredProfileIds) {
      final profile = profiles[profileId];
      if (profile == null || !profile.isConfigured) {
        throw const ValidationBatchException(
          'profileNotConfigured',
          'Faltan recursos publicados para uno o más escenarios del plan.',
        );
      }
      final dataset = datasetsByProfileId[profileId];
      if (dataset == null ||
          dataset.datasetId != profile.datasetId ||
          dataset.datasetVersionId != profile.datasetVersionId ||
          dataset.partition != profile.datasetPartition ||
          dataset.zipSha256 != profile.datasetSha256) {
        throw const ValidationBatchException(
          'datasetProfileMismatch',
          'Un dataset preparado no coincide con el perfil declarado en el plan.',
        );
      }
      final runners = runnersByProfileId[profileId];
      if (runners == null ||
          conditions.any(
            (condition) =>
                runners[condition] == null ||
                runners[condition]!.condition != condition,
          )) {
        throw const ValidationBatchException(
          'conditionNotPrepared',
          'No se prepararon ambas condiciones de uno o más perfiles.',
        );
      }
    }

    final selectedCases = <(String, List<VerifiedDatasetCase>)>[];
    for (final scenario in scenarios) {
      final profileId = scenario.resourceProfileId!;
      selectedCases.add((
        profileId,
        _casesFor(plan, scenario, datasetsByProfileId[profileId]!),
      ));
    }
    final verifiedPaths = <String, String>{};
    for (final selection in selectedCases) {
      for (final datasetCase in selection.$2) {
        final previousHash = verifiedPaths[datasetCase.localPath];
        if (previousHash != null && previousHash != datasetCase.sha256) {
          throw const ValidationBatchException(
            'datasetImageChanged',
            'Una imagen aparece con hashes distintos entre los escenarios.',
          );
        }
        if (previousHash == null) {
          await _readVerifiedImage(datasetCase);
          verifiedPaths[datasetCase.localPath] = datasetCase.sha256;
        }
      }
    }
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
    final measuredProfileId =
        scenario.resourceProfileId ??
        plan.resourceProfiles.firstWhere((profile) => profile.isConfigured).id;
    final caseScenarioId =
        scenario.phase == ValidationPhase.warmup ||
            scenario.phase == ValidationPhase.coldStart
        ? plan
              .scenarioFor(
                ValidationPhase.measured,
                resourceProfileId: measuredProfileId,
              )
              .id
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

  ValidationResourceProfile _profileForScenario(
    ExperimentPlan plan,
    ValidationScenario scenario,
  ) {
    if (scenario.resourceProfileId case final profileId?) {
      return plan.resourceProfiles.singleWhere(
        (profile) => profile.id == profileId,
      );
    }
    return plan.resourceProfiles.firstWhere((profile) => profile.isConfigured);
  }

  List<ValidationScenario> _automaticScenarios(ExperimentPlan plan) {
    final readyProfileIds = plan.resourceProfiles
        .where((profile) => profile.isConfigured)
        .map((profile) => profile.id)
        .toSet();
    return plan.scenarios
        .where(
          (scenario) =>
              const {
                ValidationPhase.warmup,
                ValidationPhase.measured,
                ValidationPhase.stress,
              }.contains(scenario.phase) &&
              !scenario.requiresExternalMeasurement &&
              readyProfileIds.contains(scenario.resourceProfileId),
        )
        .toList(growable: false);
  }

  Future<Uint8List> _readVerifiedImage(VerifiedDatasetCase datasetCase) async {
    final file = File(datasetCase.localPath);
    if (!await file.exists()) {
      throw const ValidationBatchException(
        'datasetImageUnavailable',
        'Una imagen del dataset verificado ya no está disponible.',
      );
    }
    final bytes = await _readBytes(file.path);
    if (sha256.convert(bytes).toString() != datasetCase.sha256) {
      throw const ValidationBatchException(
        'datasetImageChanged',
        'Una imagen cambió desde que se verificó el dataset; vuelve a prepararlo.',
      );
    }
    return Uint8List.fromList(bytes);
  }

  static Future<List<int>> _readFileBytes(String path) =>
      File(path).readAsBytes();
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

class ValidationSuiteProgress {
  const ValidationSuiteProgress({
    required this.completedAttempts,
    required this.totalAttempts,
    required this.profileId,
    required this.scenarioId,
    required this.phase,
    required this.condition,
    this.caseId,
    this.repetition,
  });

  final int completedAttempts;
  final int totalAttempts;
  final String profileId;
  final String scenarioId;
  final ValidationPhase phase;
  final ValidationCondition condition;
  final String? caseId;
  final int? repetition;
}

class ValidationBatchException implements Exception {
  const ValidationBatchException(this.code, this.message);

  final String code;
  final String message;

  @override
  String toString() => '$code: $message';
}
