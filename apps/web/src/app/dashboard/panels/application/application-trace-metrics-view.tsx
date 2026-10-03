"use client";

import type { ApplicationTraceMetricsResponse } from "@ayni/api/application-traces";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-error";
import { httpClient } from "@/lib/http-client";

type Period = { receivedFrom: string; receivedTo: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PERIOD_DAYS = 90;
const percentFormat = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 });
const numberFormat = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 });

function lastSevenDays(): Period {
  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 6);
  return {
    receivedFrom: from.toISOString().slice(0, 10),
    receivedTo: today.toISOString().slice(0, 10),
  };
}

function formatDuration(meanDurationMs: number | null, sampleCount: number) {
  if (meanDurationMs === null || sampleCount === 0) return "Sin muestras de duración";
  return `${numberFormat.format(meanDurationMs)} ms · n = ${sampleCount}`;
}

function formatPercent(value: number) {
  return `${percentFormat.format(value)} %`;
}

export function ApplicationTraceMetricsView({ applicationId }: { applicationId: string }) {
  const [period, setPeriod] = useState<Period>({ receivedFrom: "", receivedTo: "" });
  const [requestedPeriod, setRequestedPeriod] = useState<Period | null>(null);
  const [metrics, setMetrics] = useState<ApplicationTraceMetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const initialPeriod = lastSevenDays();
    setPeriod(initialPeriod);
    setRequestedPeriod(initialPeriod);
  }, []);

  useEffect(() => {
    if (!requestedPeriod) return;
    const controller = new AbortController();
    const query = new URLSearchParams(requestedPeriod);
    setLoading(true);
    setError("");
    setMetrics(null);
    void httpClient
      .get<ApplicationTraceMetricsResponse>(
        `/applications/${applicationId}/traces/metrics?${query.toString()}`,
        { signal: controller.signal },
      )
      .then(({ data }) => setMetrics(data))
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted)
          setError(errorMessage(loadError, "No pudimos calcular las métricas."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applicationId, requestedPeriod]);

  function applyPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const from = Date.parse(`${period.receivedFrom}T00:00:00.000Z`);
    const to = Date.parse(`${period.receivedTo}T00:00:00.000Z`);
    if (
      !period.receivedFrom ||
      !period.receivedTo ||
      !Number.isFinite(from) ||
      !Number.isFinite(to)
    ) {
      setError("Selecciona las fechas de inicio y fin.");
      return;
    }
    if (to < from) {
      setError("La fecha final no puede ser anterior a la fecha inicial.");
      return;
    }
    if (to - from >= MAX_PERIOD_DAYS * DAY_MS) {
      setError("El periodo no puede superar los 90 días.");
      return;
    }
    setRequestedPeriod({ ...period });
  }

  return (
    <section
      aria-labelledby="application-trace-metrics-title"
      className="space-y-4 rounded-md border p-4"
    >
      <header className="space-y-1">
        <h3 id="application-trace-metrics-title" className="font-semibold text-lg">
          Métricas agregadas
        </h3>
        <p className="text-muted-foreground text-sm">
          Resumen descriptivo de trazas informadas por el cliente. No valida hipótesis de tesis.
        </p>
      </header>

      <form onSubmit={applyPeriod} className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span>Desde (UTC)</span>
          <input
            type="date"
            required
            value={period.receivedFrom}
            onChange={(event) =>
              setPeriod((current) => ({ ...current, receivedFrom: event.target.value }))
            }
            className="block h-9 rounded-md border bg-background px-3"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>Hasta (UTC, inclusive)</span>
          <input
            type="date"
            required
            value={period.receivedTo}
            onChange={(event) =>
              setPeriod((current) => ({ ...current, receivedTo: event.target.value }))
            }
            className="block h-9 rounded-md border bg-background px-3"
          />
        </label>
        <Button type="submit" variant="outline" disabled={loading}>
          {loading ? "Calculando…" : "Actualizar métricas"}
        </Button>
      </form>

      {error ? <p role="alert">{error}</p> : null}
      {loading ? <p role="status">Calculando métricas…</p> : null}

      {metrics ? (
        <>
          <p className="text-muted-foreground text-sm">
            Periodo UTC: {metrics.period.from} a {metrics.period.to} (ambos días completos).
          </p>

          <section aria-label="Método y población" className="rounded-md border p-3">
            <h4 className="font-medium">Método y población</h4>
            <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
              <section className="space-y-1" aria-label="Método de métricas de workflow">
                <h4 className="font-medium">Workflows</h4>
                <p>{metrics.methodology.workflows.population}</p>
                <p>Tasa de error: {metrics.methodology.workflows.errorRate}</p>
                <p>
                  Duración ({metrics.methodology.workflows.durationUnit}):{" "}
                  {metrics.methodology.workflows.duration}
                </p>
              </section>
              <section className="space-y-1" aria-label="Método de métricas de modelo">
                <h4 className="font-medium">Modelos</h4>
                <p>{metrics.methodology.models.population}</p>
                <p>Tasa de error: {metrics.methodology.models.errorRate}</p>
                <p>
                  Duración ({metrics.methodology.models.durationUnit}):{" "}
                  {metrics.methodology.models.duration}
                </p>
              </section>
            </div>
          </section>

          {metrics.workflows.length === 0 && metrics.models.length === 0 ? (
            <p role="status">Sin datos disponibles para este periodo. No se calcularon métricas.</p>
          ) : null}

          {metrics.workflows.length > 0 ? (
            <section aria-labelledby="workflow-metrics-title" className="space-y-2">
              <h4 id="workflow-metrics-title" className="font-medium">
                Por workflow y versión
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th scope="col">Workflow</th>
                      <th scope="col">Versión</th>
                      <th scope="col">Ejecuciones</th>
                      <th scope="col">Errores</th>
                      <th scope="col">Tasa de error</th>
                      <th scope="col">Duración media</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.workflows.map((workflow) => (
                      <tr
                        key={`${workflow.workflowId}:${workflow.workflowVersionId}`}
                        className="border-t"
                      >
                        <th scope="row" className="py-2 pr-3 font-normal">
                          {workflow.workflowId}
                        </th>
                        <td className="py-2 pr-3">
                          {workflow.workflowVersion} · {workflow.workflowVersionId}
                        </td>
                        <td className="py-2 pr-3">{workflow.executionCount}</td>
                        <td className="py-2 pr-3">{workflow.errorCount}</td>
                        <td className="py-2 pr-3">{formatPercent(workflow.errorRatePercent)}</td>
                        <td className="py-2">
                          {formatDuration(workflow.meanDurationMs, workflow.durationSampleCount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {metrics.models.length > 0 ? (
            <section aria-labelledby="model-metrics-title" className="space-y-2">
              <h4 id="model-metrics-title" className="font-medium">
                Por modelo y versión
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th scope="col">Modelo</th>
                      <th scope="col">Versión</th>
                      <th scope="col">Ejecuciones</th>
                      <th scope="col">Errores</th>
                      <th scope="col">Tasa de error</th>
                      <th scope="col">Duración media</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.models.map((model) => (
                      <tr
                        key={`${model.modelId ?? "unknown"}:${model.modelVersionId}`}
                        className="border-t"
                      >
                        <th scope="row" className="py-2 pr-3 font-normal">
                          {model.modelName ?? "Modelo no disponible"}
                          <span className="block text-muted-foreground">
                            {model.modelId ?? model.modelVersionId}
                          </span>
                        </th>
                        <td className="py-2 pr-3">
                          {model.modelVersion ?? "Versión no disponible"} · {model.modelVersionId}
                        </td>
                        <td className="py-2 pr-3">{model.executionCount}</td>
                        <td className="py-2 pr-3">{model.errorCount}</td>
                        <td className="py-2 pr-3">{formatPercent(model.errorRatePercent)}</td>
                        <td className="py-2">
                          {formatDuration(model.meanDurationMs, model.durationSampleCount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : metrics.workflows.length > 0 ? (
            <p role="status">No hubo intentos de modelo en este periodo.</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
