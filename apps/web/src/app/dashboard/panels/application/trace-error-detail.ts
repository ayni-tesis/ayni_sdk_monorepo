import type { ApplicationTraceRecord } from "@ayni/api/application-traces";

type Trace = ApplicationTraceRecord["trace"];
type TraceError = NonNullable<Trace["error"]>;
type ClientReportedField = Trace["clientReportedFields"][number];

/**
 * Who produced a value: the app declared it, the SDK measured it on the device,
 * or Ayni calculated it on reception. App and SDK values are client-reported and
 * never verified by Ayni.
 */
export type TraceValueSource = "app" | "sdk" | "ayni";

export type TraceErrorField = {
  label: string;
  value: string;
  source: TraceValueSource;
  date?: true;
};

export type TraceErrorDetail = {
  sections: Array<{ title: string; fields: TraceErrorField[] }>;
};

const CATEGORY_LABELS: Record<TraceError["category"], string> = {
  workflowNotAvailable: "Workflow no disponible",
  modelNotAvailable: "Modelo no disponible",
  invalidInput: "Entrada no válida",
  unsupportedInputContract: "Contrato de entrada no compatible",
  invalidWorkflow: "Workflow no válido",
  modelOutputInvalid: "Salida del modelo no válida",
  conditionInputMissing: "Falta la entrada de la condición",
  outputInputMissing: "Falta la entrada de la salida",
  outputNotReached: "No se alcanzó ninguna salida",
  cancelled: "Ejecución cancelada",
  executionNotFound: "Ejecución no encontrada",
  runtimeError: "Error durante la ejecución",
};

const PHASE_LABELS: Record<NonNullable<TraceError["phase"]>, string> = {
  workflowResolution: "Resolución del workflow",
  modelResolution: "Resolución del modelo",
  inputValidation: "Validación de la entrada",
  modelContractValidation: "Validación del contrato del modelo",
  workflowValidation: "Validación del workflow",
  modelOutputValidation: "Validación de la salida del modelo",
  conditionEvaluation: "Evaluación de la condición",
  outputEvaluation: "Evaluación de la salida",
  workflowCompletion: "Finalización del workflow",
  executionControl: "Control de la ejecución",
  workflowExecution: "Ejecución del workflow",
};

const NODE_TYPE_LABELS: Record<Trace["nodes"][number]["type"], string> = {
  "input.image": "Entrada de imagen",
  "model.tflite": "Modelo",
  condition: "Condición",
  output: "Salida",
};

const PLATFORM_LABELS: Record<Trace["profile"]["platform"], string> = {
  android: "Android",
  ios: "iOS",
  unknown: "Desconocida",
};

const NOT_AVAILABLE = "No disponible";

/**
 * The sanitized detail of a failed trace: what failed, the resource it affects
 * when the trace names one, and the run, provenance and device it relates to.
 * When the error names no node or model, the node the SDK reported as `failed`
 * stands in. Category, node and model read `No disponible` when the trace has
 * none; other values the trace does not carry are left out.
 */
export function traceErrorDetail(record: ApplicationTraceRecord): TraceErrorDetail | null {
  const { trace } = record;
  const { error } = trace;
  if (!error && trace.status !== "error") return null;

  const declared = new Set<ClientReportedField>(trace.clientReportedFields);
  const sourceOf = (name: ClientReportedField): TraceValueSource =>
    declared.has(name) ? "app" : "sdk";
  const fields = (
    entries: Array<[label: string, value: string | number | undefined, source: TraceValueSource]>,
  ): TraceErrorField[] =>
    entries.flatMap(([label, value, source]) =>
      value === undefined ? [] : [{ label, value: String(value), source }],
    );

  const node =
    trace.nodes.find((candidate) => candidate.nodeId === error?.nodeId) ??
    (error?.nodeId ? undefined : trace.nodes.find((candidate) => candidate.status === "failed"));
  const nodeId = error?.nodeId ?? node?.nodeId;
  const modelVersionId = error?.modelVersionId ?? node?.modelVersionId;
  const model = trace.models.find((candidate) => candidate.modelVersionId === modelVersionId);

  const sections: TraceErrorDetail["sections"] = [
    {
      title: "Error",
      fields: fields([
        [
          "Categoría",
          error ? `${CATEGORY_LABELS[error.category]} (${error.category})` : NOT_AVAILABLE,
          "sdk",
        ],
        ["Fase", error?.phase && PHASE_LABELS[error.phase], "sdk"],
        [
          "Nodo",
          nodeId
            ? [nodeId, node && NODE_TYPE_LABELS[node.type]].filter(Boolean).join(" · ")
            : NOT_AVAILABLE,
          "sdk",
        ],
        ["Workflow", trace.workflowId, "sdk"],
        ["Versión", `${trace.workflowVersion} · ${trace.workflowVersionId}`, "sdk"],
        [
          "Modelo",
          model ? `${model.version} · ${model.modelVersionId}` : (modelVersionId ?? NOT_AVAILABLE),
          "sdk",
        ],
        ["SHA-256 del modelo", model?.sha256, "sdk"],
      ]),
    },
    {
      title: "Ejecución",
      fields: fields([
        ["Corrida", trace.runId, sourceOf("runId")],
        ["Repetición", trace.repetition, sourceOf("repetition")],
        ["Condición", trace.condition, sourceOf("condition")],
        ["Caso", trace.caseId, sourceOf("caseId")],
        ["Escenario", trace.scenario, sourceOf("scenario")],
        ["Backend", trace.backend, sourceOf("backend")],
        ["Red", trace.network, sourceOf("network")],
      ]),
    },
    {
      title: "Procedencia declarada",
      fields: fields([
        ["Versión de la app", trace.appVersion, sourceOf("appVersion")],
        ["Versión del SDK", trace.sdkVersion, sourceOf("sdkVersion")],
        ["Commit de la app", trace.appCommit, sourceOf("appCommit")],
        ["Commit del SDK", trace.sdkCommit, sourceOf("sdkCommit")],
        ["Dataset", trace.datasetId, sourceOf("datasetId")],
        ["Partición del dataset", trace.datasetPartition, sourceOf("datasetPartition")],
        ["SHA-256 del dataset", trace.datasetSha256, sourceOf("datasetSha256")],
      ]),
    },
    {
      title: "Perfil técnico",
      fields: fields([
        ["Plataforma", PLATFORM_LABELS[trace.profile.platform], "sdk"],
        ["Sistema operativo", trace.profile.osVersion, "sdk"],
        ["Nivel de API", trace.profile.apiLevel, "sdk"],
        ["Dispositivo", trace.profile.model, "sdk"],
        ["RAM (rango)", trace.profile.ramRange, sourceOf("ramRange")],
        ["SoC", trace.profile.socModel, sourceOf("socModel")],
      ]),
    },
    {
      title: "Calculado por Ayni",
      fields: [
        { label: "Recibida", value: record.receivedAt, source: "ayni", date: true },
        { label: "Disponible hasta", value: record.expiresAt, source: "ayni", date: true },
      ],
    },
  ];
  return { sections: sections.filter((section) => section.fields.length > 0) };
}
