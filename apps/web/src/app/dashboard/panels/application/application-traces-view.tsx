"use client";

import type {
  ApplicationTraceListResponse,
  ApplicationTraceRecord,
  ApplicationTraceSummary,
} from "@ayni/api/application-traces";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-error";
import { httpClient } from "@/lib/http-client";
import type { Application } from "../../types";
import { type TraceValueSource, traceErrorDetail } from "./trace-error-detail";

const PAGE_SIZE = 50;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function deviceLabel(profile: ApplicationTraceSummary["trace"]["profile"]) {
  return (
    [profile.model, profile.platform, profile.osVersion].filter(Boolean).join(" · ") ||
    "Desconocido"
  );
}

function statusLabel(status: ApplicationTraceSummary["trace"]["status"]) {
  return status === "success" ? "Exitosa" : "Error";
}

export function ApplicationTracesView({ application }: { application: Application }) {
  const [page, setPage] = useState<ApplicationTraceListResponse>({ traces: [], nextCursor: null });
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [record, setRecord] = useState<ApplicationTraceRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const detailController = useRef<AbortController | null>(null);

  const cursor = cursorHistory[pageIndex];
  useEffect(() => {
    const controller = new AbortController();
    setPage({ traces: [], nextCursor: null });
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor) query.set("cursor", cursor);
    void httpClient
      .get<ApplicationTraceListResponse>(
        `/applications/${application.id}/traces?${query.toString()}`,
        { signal: controller.signal },
      )
      .then(({ data }) => setPage(data))
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted)
          setError(errorMessage(loadError, "No pudimos cargar las trazas."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [application.id, cursor]);

  useEffect(() => () => detailController.current?.abort(), []);

  async function openTrace(traceId: string) {
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    setSelectedTraceId(traceId);
    setRecord(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const { data } = await httpClient.get<{ record: ApplicationTraceRecord }>(
        `/applications/${application.id}/traces/${traceId}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setRecord(data.record);
    } catch (loadError) {
      if (!controller.signal.aborted)
        setDetailError(errorMessage(loadError, "No pudimos cargar esta traza."));
    } finally {
      if (!controller.signal.aborted) setDetailLoading(false);
    }
  }

  async function exportTraces() {
    setExporting(true);
    try {
      const { data } = await httpClient.get<Blob>(`/applications/${application.id}/traces/export`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "application-traces.jsonl";
      link.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(errorMessage(exportError, "No pudimos exportar las trazas."));
    } finally {
      setExporting(false);
    }
  }

  return (
    <section aria-labelledby="application-traces-title" className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="application-traces-title" className="font-semibold text-xl">
            Trazas
          </h2>
          <p className="text-muted-foreground text-sm">
            Registros técnicos reportados por el cliente; sus valores no están verificados por el
            servidor.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={exporting}
          onClick={() => void exportTraces()}
        >
          {exporting ? "Exportando…" : "Exportar JSONL"}
        </Button>
      </header>

      {error && (
        <p role="alert" className="rounded-md border p-3 text-sm">
          {error}
        </p>
      )}

      {loading ? (
        <p role="status">Cargando trazas…</p>
      ) : page.traces.length === 0 ? (
        <p className="rounded-md border p-4 text-muted-foreground text-sm">
          Aún no hay trazas disponibles para esta aplicación.
        </p>
      ) : (
        <ul className="divide-y rounded-md border" aria-label="Trazas de la aplicación">
          {page.traces.map(({ trace, receivedAt }) => (
            <li key={trace.traceId} className="p-3">
              <button
                type="button"
                className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
                aria-label={`Ver detalle de la traza ${trace.traceId}`}
                aria-expanded={selectedTraceId === trace.traceId}
                onClick={() => void openTrace(trace.traceId)}
              >
                <span className="space-y-1">
                  <span className="block font-medium">{statusLabel(trace.status)}</span>
                  <span className="block text-muted-foreground text-sm">
                    Workflow {trace.workflowVersion} · {trace.workflowId}
                  </span>
                  <span className="block text-muted-foreground text-sm">
                    Duración: {trace.durationMs} ms
                  </span>
                  <span className="block text-muted-foreground text-sm">
                    Modelos: {trace.models.map((model) => model.version).join(", ") || "ninguno"}
                  </span>
                  <span className="block text-muted-foreground text-sm">
                    {deviceLabel(trace.profile)}
                  </span>
                </span>
                <span className="space-y-1 text-right text-muted-foreground text-sm">
                  <span className="block">Recibida {formatDate(receivedAt)}</span>
                  {trace.status === "error" && (
                    <span className="block font-medium text-foreground underline">Ver detalle</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <nav aria-label="Paginación de trazas" className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pageIndex === 0 || loading}
          onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
        >
          Anterior
        </Button>
        <span className="text-muted-foreground text-sm">Página {pageIndex + 1}</span>
        <Button
          type="button"
          variant="outline"
          disabled={!page.nextCursor || loading}
          onClick={() => {
            const nextCursor = page.nextCursor;
            if (!nextCursor) return;
            setCursorHistory((history) => [...history.slice(0, pageIndex + 1), nextCursor]);
            setPageIndex((index) => index + 1);
          }}
        >
          Siguiente
        </Button>
      </nav>

      {selectedTraceId && (
        <section aria-labelledby="trace-detail-title" className="space-y-4 rounded-md border p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 id="trace-detail-title" className="font-semibold">
              Detalle de la traza
            </h3>
            <Button type="button" variant="ghost" onClick={() => setSelectedTraceId(null)}>
              Cerrar
            </Button>
          </div>
          {detailLoading && <p role="status">Cargando registro…</p>}
          {detailError && <p role="alert">{detailError}</p>}
          {record && <TraceErrorSection record={record} />}
          {record && (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium">Estado</dt>
                <dd>{statusLabel(record.trace.status)}</dd>
              </div>
              <div>
                <dt className="font-medium">Fecha reportada</dt>
                <dd>{formatDate(record.trace.timestamp)}</dd>
              </div>
              <div>
                <dt className="font-medium">Dispositivo</dt>
                <dd>{deviceLabel(record.trace.profile)}</dd>
              </div>
              <div>
                <dt className="font-medium">Versión del workflow</dt>
                <dd>{record.trace.workflowVersion}</dd>
              </div>
              <div>
                <dt className="font-medium">Duración</dt>
                <dd>{record.trace.durationMs} ms</dd>
              </div>
              <div>
                <dt className="font-medium">Procedencia del registro</dt>
                <dd>{record.source}</dd>
              </div>
            </dl>
          )}
          {record && <TraceJson title="Registro versionado completo" value={record} />}
        </section>
      )}
    </section>
  );
}

const SOURCE_LABELS: Record<TraceValueSource, string> = { app: "App", sdk: "SDK", ayni: "Ayni" };

function TraceErrorSection({ record }: { record: ApplicationTraceRecord }) {
  const detail = traceErrorDetail(record);
  if (!detail) return null;
  return (
    <section aria-labelledby="trace-error-title" className="space-y-4 rounded-md border p-4">
      <div className="space-y-1">
        <h4 id="trace-error-title" className="font-semibold">
          Error de ejecución
        </h4>
        <p className="text-muted-foreground text-sm">No se muestran secretos ni rutas internas.</p>
        <p className="text-muted-foreground text-sm">
          Los valores de App y SDK son reportados por el cliente y no están verificados por Ayni.
        </p>
      </div>
      {detail.sections.map((section) => (
        <div key={section.title} className="space-y-2">
          <h5 className="font-medium text-sm">{section.title}</h5>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {section.fields.map((field) => (
              <div key={field.label}>
                <dt className="flex items-center gap-2 font-medium">
                  {field.label}
                  <span className="rounded border px-1 font-normal text-muted-foreground text-xs">
                    {SOURCE_LABELS[field.source]}
                  </span>
                </dt>
                <dd className="break-all">{field.date ? formatDate(field.value) : field.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}

function TraceJson({ title, value }: { title: string; value: unknown }) {
  return (
    <details>
      <summary className="cursor-pointer font-medium">{title}</summary>
      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
