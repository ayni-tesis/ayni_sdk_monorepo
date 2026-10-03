import type {
  ApplicationTraceMetricsQuery,
  ApplicationTraceMetricsResponse,
} from "@ayni/api/application-traces";
import { applicationTraceMetricsResponseSchema } from "@ayni/api/application-traces";
import { model, sdkTrace } from "@ayni/db/schema/index";
import { sql } from "drizzle-orm";
import type { SdkTraceDatabase } from "./sdk-trace-store";

type WorkflowMetricRow = {
  workflow_id: string;
  workflow_version_id: string;
  workflow_version: string;
  execution_count: number | string;
  error_count: number | string;
  duration_sample_count: number | string;
  mean_duration_ms: number | string | null;
};

type ModelMetricRow = {
  model_id: string | null;
  model_name: string | null;
  model_version_id: string;
  model_version: string | null;
  execution_count: number | string;
  error_count: number | string;
  duration_sample_count: number | string;
  mean_duration_ms: number | string | null;
};

function toNumber(value: number | string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Invalid application trace aggregate");
  return number;
}

function aggregates(row: {
  execution_count: number | string;
  error_count: number | string;
  duration_sample_count: number | string;
  mean_duration_ms: number | string | null;
}) {
  const executionCount = toNumber(row.execution_count);
  const errorCount = toNumber(row.error_count);
  return {
    executionCount,
    errorCount,
    errorRatePercent: (errorCount * 100) / executionCount,
    durationSampleCount: toNumber(row.duration_sample_count),
    meanDurationMs: row.mean_duration_ms === null ? null : toNumber(row.mean_duration_ms),
  };
}

function periodDates({ receivedFrom, receivedTo }: ApplicationTraceMetricsQuery) {
  const from = new Date(`${receivedFrom}T00:00:00.000Z`);
  const before = new Date(`${receivedTo}T00:00:00.000Z`);
  before.setUTCDate(before.getUTCDate() + 1);
  return { from, before };
}

export async function getApplicationTraceMetrics(
  database: SdkTraceDatabase,
  { applicationId, ...period }: ApplicationTraceMetricsQuery & { applicationId: string },
): Promise<ApplicationTraceMetricsResponse> {
  const { from, before } = periodDates(period);
  const now = new Date();
  const traceFilter = sql`
    ${sdkTrace.applicationId} = ${applicationId}
    and ${sdkTrace.source} = 'clientReported'
    and ${sdkTrace.receivedAt} >= ${from}
    and ${sdkTrace.receivedAt} < ${before}
    and ${sdkTrace.expiresAt} > ${now}
  `;

  const workflows = await database.execute<WorkflowMetricRow>(sql`
    select
      ${sdkTrace.trace} ->> 'workflowId' as workflow_id,
      ${sdkTrace.trace} ->> 'workflowVersionId' as workflow_version_id,
      ${sdkTrace.trace} ->> 'workflowVersion' as workflow_version,
      count(*)::int as execution_count,
      count(*) filter (where ${sdkTrace.trace} ->> 'status' = 'error')::int as error_count,
      count(${sdkTrace.trace} ->> 'durationMs')::int as duration_sample_count,
      avg((${sdkTrace.trace} ->> 'durationMs')::numeric)::float8 as mean_duration_ms
    from ${sdkTrace}
    where ${traceFilter}
    group by 1, 2, 3
    order by 1, 2, 3
  `);

  const models = await database.execute<ModelMetricRow>(sql`
    with model_attempts as (
      select
        ${sdkTrace.applicationId} as application_id,
        model_node.value ->> 'modelVersionId' as model_version_id,
        model_node.value ->> 'status' as status,
        case
          when model_node.value ? 'durationMs'
          then (model_node.value ->> 'durationMs')::numeric
          else null
        end as duration_ms,
        (
          select model_reference.value ->> 'modelId'
          from jsonb_array_elements(coalesce(${sdkTrace.modelReferences}, '[]'::jsonb))
            as model_reference(value)
          where model_reference.value ->> 'modelVersionId' = model_node.value ->> 'modelVersionId'
          limit 1
        ) as model_id,
        coalesce(
          (
            select model_reference.value ->> 'version'
            from jsonb_array_elements(coalesce(${sdkTrace.modelReferences}, '[]'::jsonb))
              as model_reference(value)
            where model_reference.value ->> 'modelVersionId' = model_node.value ->> 'modelVersionId'
            limit 1
          ),
          (
            select trace_model.value ->> 'version'
            from jsonb_array_elements(coalesce(${sdkTrace.trace} -> 'models', '[]'::jsonb))
              as trace_model(value)
            where trace_model.value ->> 'modelVersionId' = model_node.value ->> 'modelVersionId'
            limit 1
          )
        ) as model_version
      from ${sdkTrace}
      cross join lateral jsonb_array_elements(
        coalesce(${sdkTrace.trace} -> 'nodes', '[]'::jsonb)
      ) as model_node(value)
      where ${traceFilter}
        and model_node.value ->> 'type' = 'model.tflite'
        and model_node.value ->> 'status' in ('completed', 'failed')
        and model_node.value ->> 'modelVersionId' is not null
    )
    select
      model_attempts.model_id,
      ${model.name} as model_name,
      model_attempts.model_version_id,
      model_attempts.model_version,
      count(*)::int as execution_count,
      count(*) filter (where model_attempts.status = 'failed')::int as error_count,
      count(model_attempts.duration_ms)::int as duration_sample_count,
      avg(model_attempts.duration_ms)::float8 as mean_duration_ms
    from model_attempts
    left join ${model}
      on ${model.id} = model_attempts.model_id
      and ${model.applicationId} = model_attempts.application_id
    group by 1, 2, 3, 4
    order by 1, 3, 4
  `);

  return applicationTraceMetricsResponseSchema.parse({
    period: { from: period.receivedFrom, to: period.receivedTo, timeZone: "UTC" },
    methodology: {
      workflows: {
        population:
          "Trazas clientReported no vencidas de esta aplicación recibidas durante el periodo; una traza equivale a una ejecución del workflow. Los valores los informa el cliente.",
        errorRate: "Ejecuciones con status=error / ejecuciones incluidas × 100.",
        duration: "Media aritmética del durationMs informado en cada traza.",
        durationUnit: "ms",
      },
      models: {
        population:
          "Nodos model.tflite con modelVersionId identificable y estado completed o failed; los nodos skipped se excluyen. Cada nodo intentado cuenta como una ejecución de modelo.",
        errorRate: "Nodos failed / nodos completed o failed incluidos × 100.",
        duration: "Media aritmética del durationMs informado por los nodos de modelo.",
        durationUnit: "ms",
      },
    },
    workflows: workflows.map((row) => ({
      workflowId: row.workflow_id,
      workflowVersionId: row.workflow_version_id,
      workflowVersion: row.workflow_version,
      ...aggregates(row),
    })),
    models: models.map((row) => ({
      modelId: row.model_id,
      modelName: row.model_name,
      modelVersionId: row.model_version_id,
      modelVersion: row.model_version,
      ...aggregates(row),
    })),
  });
}
