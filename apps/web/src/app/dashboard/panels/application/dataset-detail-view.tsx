"use client";

import type {
  DatasetAvailableEvidenceResponse,
  DatasetDetailResponse,
  DatasetEvidence,
} from "@ayni/api/datasets";
import { IconRefresh } from "@tabler/icons-react";
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/api-error";
import { formatLongDateEs } from "@/lib/format-date";
import { httpClient } from "@/lib/http-client";
import type { Application } from "../../types";

const NOT_FOUND = "No encontramos este dataset.";
const LOAD_ERROR = "No pudimos cargar el dataset.";
const MAX_EVIDENCE_PER_ADD = 500;

export type DatasetDetailViewProps = {
  application: Application;
  datasetId: string;
  canManage?: boolean;
  onBackToDatasets?: () => void;
};

export function DatasetDetailView({
  application,
  datasetId,
  canManage = false,
  onBackToDatasets,
}: DatasetDetailViewProps) {
  const [detail, setDetail] = useState<DatasetDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [itemsError, setItemsError] = useState("");
  const [itemsLoading, setItemsLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [available, setAvailable] = useState<DatasetAvailableEvidenceResponse["evidence"]>([]);
  const [nextEvidenceOffset, setNextEvidenceOffset] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [availableError, setAvailableError] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const itemsAbortRef = useRef<AbortController | null>(null);
  const availableAbortRef = useRef<AbortController | null>(null);

  const loadDetail = useCallback(async () => {
    abortRef.current?.abort();
    itemsAbortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setNotFound(false);
    setError("");
    setItemsError("");
    try {
      const { data } = await httpClient.get<DatasetDetailResponse>(
        `/applications/${encodeURIComponent(application.id)}/datasets/${encodeURIComponent(datasetId)}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setDetail(data);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setDetail(null);
      if (axios.isAxiosError(loadError) && loadError.response?.status === 404) {
        setNotFound(true);
      } else {
        setError(errorMessage(loadError, LOAD_ERROR));
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [application.id, datasetId]);

  const loadMoreDatasetItems = useCallback(async () => {
    const offset = detail?.nextItemOffset;
    if (offset === null || offset === undefined || itemsLoading) return;
    itemsAbortRef.current?.abort();
    const controller = new AbortController();
    itemsAbortRef.current = controller;
    setItemsLoading(true);
    setItemsError("");
    try {
      const { data } = await httpClient.get<DatasetDetailResponse>(
        `/applications/${encodeURIComponent(application.id)}/datasets/${encodeURIComponent(datasetId)}`,
        { params: { offset }, signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setDetail((current) =>
          current
            ? {
                ...current,
                items: [...current.items, ...data.items],
                nextItemOffset: data.nextItemOffset,
              }
            : current,
        );
      }
    } catch (loadError) {
      if (!controller.signal.aborted) {
        setItemsError(errorMessage(loadError, "No pudimos cargar las evidencias del dataset."));
      }
    } finally {
      if (!controller.signal.aborted) setItemsLoading(false);
    }
  }, [application.id, datasetId, detail?.nextItemOffset, itemsLoading]);

  const loadAvailableEvidence = useCallback(
    async (offset = 0) => {
      availableAbortRef.current?.abort();
      const controller = new AbortController();
      availableAbortRef.current = controller;
      setAvailableLoading(true);
      setAvailableError("");
      if (offset === 0) {
        setAvailable([]);
        setNextEvidenceOffset(null);
      }
      try {
        const { data } = await httpClient.get<DatasetAvailableEvidenceResponse>(
          `/applications/${encodeURIComponent(application.id)}/datasets/${encodeURIComponent(datasetId)}/available-evidence`,
          { params: { offset }, signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setAvailable((current) =>
            offset === 0 ? data.evidence : [...current, ...data.evidence],
          );
          setNextEvidenceOffset(data.nextOffset);
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          if (offset === 0) setAvailable([]);
          setAvailableError(errorMessage(loadError, "No pudimos cargar las evidencias."));
        }
      } finally {
        if (!controller.signal.aborted) setAvailableLoading(false);
      }
    },
    [application.id, datasetId],
  );

  useEffect(() => {
    if (!addOpen || !canManage || application.status !== "active") return;
    setSelectedIds([]);
    void loadAvailableEvidence();
    return () => availableAbortRef.current?.abort();
  }, [addOpen, application.status, canManage, loadAvailableEvidence]);

  async function addEvidence() {
    if (!detail || !canManage || application.status !== "active" || !selectedIds.length || adding) {
      return;
    }
    setAdding(true);
    setAddError("");
    try {
      await httpClient.post(
        `/applications/${encodeURIComponent(application.id)}/datasets/${encodeURIComponent(datasetId)}/evidence`,
        { evidenceIds: selectedIds },
      );
      await loadDetail();
      setNotice("Evidencia agregada al dataset.");
      setAddOpen(false);
      setSelectedIds([]);
    } catch (saveError) {
      setAddError(errorMessage(saveError, "No pudimos agregar la evidencia al dataset."));
    } finally {
      setAdding(false);
    }
  }

  useEffect(() => {
    void loadDetail();
    return () => {
      abortRef.current?.abort();
      itemsAbortRef.current?.abort();
    };
  }, [loadDetail]);

  if (loading) {
    return (
      <p data-testid="dataset-detail-loading" className="text-muted-foreground text-sm">
        Cargando dataset…
      </p>
    );
  }
  if (notFound) {
    return (
      <p data-testid="dataset-detail-not-found" className="text-muted-foreground text-sm">
        {NOT_FOUND}
      </p>
    );
  }
  if (error || !detail) {
    return (
      <div className="applications-error flex items-center gap-3">
        <p className="text-destructive text-sm">{error || LOAD_ERROR}</p>
        <Button
          variant="outline"
          size="sm"
          data-testid="dataset-detail-retry"
          onClick={() => void loadDetail()}
        >
          <IconRefresh className="mr-1 size-4" />
          Reintentar
        </Button>
      </div>
    );
  }

  const { dataset, items } = detail;

  const datasetsUrl = `/dashboard/applications/${encodeURIComponent(application.id)}/validation-datasets`;

  return (
    <section className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              href={datasetsUrl}
              onClick={(event) => {
                if (!onBackToDatasets) return;
                event.preventDefault();
                onBackToDatasets();
              }}
            >
              Datasets
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{dataset.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="space-y-3" data-testid="dataset-detail-header">
        <h2 className="font-semibold text-lg">{dataset.name}</h2>
        <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">ID del dataset</dt>
            <dd>
              <code>{dataset.id}</code>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tipo de tarea</dt>
            <dd>{dataset.taskType === "classification" ? "Clasificación" : "Detección"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Evidencias</dt>
            <dd>{dataset.evidenceCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Creado el</dt>
            <dd>{formatLongDateEs(dataset.createdAt)}</dd>
          </div>
        </dl>
      </header>

      <Tabs defaultValue="evidences">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="evidences">Evidencias</TabsTrigger>
            <TabsTrigger value="exports">Exportaciones</TabsTrigger>
          </TabsList>
          {canManage && application.status === "active" && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <Button
                type="button"
                onClick={() => {
                  setAddError("");
                  setNotice("");
                  setAddOpen(true);
                }}
              >
                Agregar evidencia
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Agregar evidencia</DialogTitle>
                  <DialogDescription>
                    Selecciona evidencia compatible. Puedes agregar hasta 500 por operación.
                  </DialogDescription>
                </DialogHeader>
                {availableLoading && available.length === 0 ? (
                  <p role="status">Cargando evidencias…</p>
                ) : availableError && available.length === 0 ? (
                  <div className="space-y-2" role="alert">
                    <p className="text-destructive text-sm">{availableError}</p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void loadAvailableEvidence()}
                    >
                      Reintentar
                    </Button>
                  </div>
                ) : available.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No hay evidencia compatible para agregar.
                  </p>
                ) : (
                  <ul className="max-h-72 space-y-2 overflow-y-auto">
                    {available.map((evidence) => (
                      <EvidenceOption
                        key={evidence.evidenceId}
                        evidence={evidence}
                        selected={selectedIds.includes(evidence.evidenceId)}
                        disabled={
                          !selectedIds.includes(evidence.evidenceId) &&
                          selectedIds.length >= MAX_EVIDENCE_PER_ADD
                        }
                        onToggle={() =>
                          setSelectedIds((current) =>
                            current.includes(evidence.evidenceId)
                              ? current.filter((id) => id !== evidence.evidenceId)
                              : [...current, evidence.evidenceId],
                          )
                        }
                      />
                    ))}
                  </ul>
                )}
                {availableError && available.length > 0 && (
                  <p role="alert" className="text-destructive text-sm">
                    {availableError}
                  </p>
                )}
                {nextEvidenceOffset !== null && available.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={availableLoading}
                    onClick={() => void loadAvailableEvidence(nextEvidenceOffset)}
                  >
                    {availableLoading ? "Cargando evidencias…" : "Cargar más evidencias"}
                  </Button>
                )}
                {addError && (
                  <p role="alert" className="text-destructive text-sm">
                    {addError}
                  </p>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={adding}
                    onClick={() => setAddOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    disabled={adding || availableLoading || selectedIds.length === 0}
                    onClick={() => void addEvidence()}
                  >
                    {adding ? "Agregando evidencia…" : "Agregar seleccionadas"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        {notice && (
          <p role="status" className="mt-3 text-sm">
            {notice}
          </p>
        )}
        <TabsContent value="evidences">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aún no hay evidencias en este dataset.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <EvidenceItem key={item.id} item={item} />
              ))}
            </ul>
          )}
          {itemsError && (
            <p role="alert" className="mt-3 text-destructive text-sm">
              {itemsError}
            </p>
          )}
          {detail.nextItemOffset !== null && (
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={itemsLoading}
              onClick={() => void loadMoreDatasetItems()}
            >
              {itemsLoading ? "Cargando evidencias…" : "Cargar más evidencias del dataset"}
            </Button>
          )}
        </TabsContent>
        <TabsContent value="exports">
          <p className="text-muted-foreground text-sm">
            Aún no hay exportaciones para este dataset.
          </p>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function EvidenceItem({ item }: { item: DatasetDetailResponse["items"][number] }) {
  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <code className="text-sm">{item.evidenceId}</code>
        <time className="text-muted-foreground text-sm" dateTime={item.capturedAt}>
          {formatLongDateEs(item.capturedAt)}
        </time>
      </div>
      <p className="mt-2 text-sm">Predicción original: {resultSummary(item.originalResult)}</p>
      <p className="mt-1 text-muted-foreground text-xs">
        Modelo {item.modelId} · versión {item.modelVersion}
      </p>
    </li>
  );
}

function EvidenceOption({
  evidence,
  selected,
  disabled,
  onToggle,
}: {
  evidence: DatasetEvidence;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="rounded-lg border p-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={onToggle}
          className="mt-1 size-4 accent-primary"
        />
        <span className="min-w-0 space-y-1">
          <code className="block truncate text-xs">{evidence.evidenceId}</code>
          <span className="block text-sm">Predicción: {resultSummary(evidence.result)}</span>
          <span className="block text-muted-foreground text-xs">
            {formatLongDateEs(evidence.capturedAt)} · Modelo {evidence.modelId} · versión{" "}
            {evidence.modelVersion}
          </span>
        </span>
      </label>
    </li>
  );
}

function resultSummary(result: Record<string, unknown>) {
  if (result.type === "classification" && typeof result.label === "string") {
    const confidence =
      typeof result.confidence === "number" ? ` (${Math.round(result.confidence * 100)}%)` : "";
    return `${result.label}${confidence}`;
  }
  if (result.type === "detection" && Array.isArray(result.detections)) {
    return `${result.detections.length} detecciones`;
  }
  return "Resultado guardado";
}
