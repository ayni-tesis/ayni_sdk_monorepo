"use client";

import {
  DATASET_LABEL_MAX_LENGTH,
  type DatasetAvailableEvidenceResponse,
  type DatasetDetailResponse,
  type DatasetEvidence,
  type DatasetExport,
  type DatasetExportListResponse,
  type DatasetExportResponse,
  type DatasetLabelResponse,
  type DatasetReviewResponse,
} from "@ayni/api/datasets";
import { IconRefresh } from "@tabler/icons-react";
import axios from "axios";
import Image from "next/image";
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/api-error";
import { formatLongDateEs } from "@/lib/format-date";
import { httpClient } from "@/lib/http-client";
import type { Application } from "../../types";

const NOT_FOUND = "No encontramos este dataset.";
const LOAD_ERROR = "No pudimos cargar el dataset.";
const MAX_EVIDENCE_PER_ADD = 500;
const LABEL_REQUIRED = "Ingresa una etiqueta para una evidencia aprobada.";

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
  const [exports, setExports] = useState<DatasetExport[]>([]);
  const [exportsLoading, setExportsLoading] = useState(true);
  const [exportsError, setExportsError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const itemsAbortRef = useRef<AbortController | null>(null);
  const availableAbortRef = useRef<AbortController | null>(null);
  const exportsAbortRef = useRef<AbortController | null>(null);
  const retiredEvidenceIdsRef = useRef(new Set<string>());
  const exportsUrl =
    "/applications/" +
    encodeURIComponent(application.id) +
    "/datasets/" +
    encodeURIComponent(datasetId) +
    "/exports";

  const loadDetail = useCallback(
    async (showLoading = true) => {
      abortRef.current?.abort();
      itemsAbortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (showLoading) {
        setLoading(true);
      }
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
        if (!controller.signal.aborted && showLoading) setLoading(false);
      }
    },
    [application.id, datasetId],
  );

  const loadExports = useCallback(async () => {
    exportsAbortRef.current?.abort();
    const controller = new AbortController();
    exportsAbortRef.current = controller;
    setExportsLoading(true);
    setExportsError("");
    try {
      const { data } = await httpClient.get<DatasetExportListResponse>(
        exportsUrl,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setExports(data.exports);
    } catch (loadError) {
      if (!controller.signal.aborted) {
        setExportsError(errorMessage(loadError, "No pudimos cargar las exportaciones."));
      }
    } finally {
      if (!controller.signal.aborted) setExportsLoading(false);
    }
  }, [exportsUrl]);

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
      setAddOpen(false);
      setSelectedIds([]);
      await loadDetail(false);
      setNotice("Evidencia agregada al dataset.");
    } catch (saveError) {
      setAddError(errorMessage(saveError, "No pudimos agregar la evidencia al dataset."));
    } finally {
      setAdding(false);
    }
  }

  async function generateClassificationExport() {
    if (
      !canManage ||
      application.status !== "active" ||
      detail?.dataset.taskType !== "classification" ||
      exporting
    ) {
      return;
    }
    setExporting(true);
    setExportError("");
    setNotice("");
    try {
      const { data } = await httpClient.post<DatasetExportResponse>(exportsUrl);
      setExports((current) => [data.export, ...current]);
      setExportOpen(false);
      setNotice("Exportación de clasificación lista.");
    } catch (saveError) {
      setExportError(
        errorMessage(saveError, "No pudimos generar la exportación de clasificación."),
      );
    } finally {
      setExporting(false);
    }
  }

  async function removeEvidence(itemId: string) {
    if (!canManage || application.status !== "active") return;
    setNotice("");
    await httpClient.delete(
      `/applications/${encodeURIComponent(application.id)}/datasets/${encodeURIComponent(datasetId)}/evidence/${encodeURIComponent(itemId)}`,
    );
    retiredEvidenceIdsRef.current.add(itemId);
    setDetail((current) => {
      if (!current) return current;
      const items = current.items.filter((item) => item.id !== itemId);
      if (items.length === current.items.length) return current;
      const removed = current.items.find((item) => item.id === itemId);
      return {
        ...current,
        dataset: {
          ...current.dataset,
          evidenceCount: Math.max(0, current.dataset.evidenceCount - 1),
          approvedCount: Math.max(
            0,
            current.dataset.approvedCount - Number(removed?.reviewStatus === "approved"),
          ),
        },
        items,
        nextItemOffset:
          current.nextItemOffset === null ? null : Math.max(0, current.nextItemOffset - 1),
      };
    });
    setNotice("Evidencia retirada del dataset.");
  }

  async function reviewEvidence(itemId: string, status: "approved" | "rejected", reason?: string) {
    const { data } = await httpClient.patch<DatasetReviewResponse>(
      `/applications/${encodeURIComponent(application.id)}/datasets/${encodeURIComponent(datasetId)}/evidence/${encodeURIComponent(itemId)}/review`,
      { status, ...(reason ? { reason } : {}) },
    );
    if (retiredEvidenceIdsRef.current.has(itemId)) return;
    setDetail((current) => {
      if (!current) return current;
      const oldItem = current.items.find((item) => item.id === itemId);
      const countChange = oldItem
        ? Number(data.status === "approved") - Number(oldItem.reviewStatus === "approved")
        : 0;
      return {
        ...current,
        dataset: {
          ...current.dataset,
          approvedCount: Math.max(0, current.dataset.approvedCount + countChange),
        },
        items: current.items.map((item) =>
          item.id === itemId
            ? {
                ...item,
                reviewStatus: data.status,
                reviewerName: data.reviewerName,
                reviewedAt: data.reviewedAt,
                reviewReason: data.reason,
              }
            : item,
        ),
      };
    });
    setNotice(status === "approved" ? "Evidencia aprobada." : "Evidencia rechazada.");
  }

  async function saveLabel(itemId: string, label: string) {
    const { data } = await httpClient.put<DatasetLabelResponse>(
      `/applications/${encodeURIComponent(application.id)}/datasets/${encodeURIComponent(datasetId)}/evidence/${encodeURIComponent(itemId)}/label`,
      { label },
    );
    if (retiredEvidenceIdsRef.current.has(itemId)) return;
    setDetail((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === itemId ? { ...item, reviewedLabel: data.reviewedLabel } : item,
            ),
          }
        : current,
    );
    setNotice("Etiqueta revisada guardada.");
  }

  useEffect(() => {
    void loadDetail();
    void loadExports();
    return () => {
      abortRef.current?.abort();
      itemsAbortRef.current?.abort();
      exportsAbortRef.current?.abort();
    };
  }, [loadDetail, loadExports]);

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
                <EvidenceItem
                  key={item.id}
                  item={item}
                  canRemove={canManage && application.status === "active"}
                  onRemove={removeEvidence}
                  onReview={reviewEvidence}
                  onSaveLabel={saveLabel}
                />
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
          <div className="space-y-4">
            {canManage &&
              application.status === "active" &&
              dataset.taskType === "classification" && (
                <Dialog
                  open={exportOpen}
                  onOpenChange={(open) => {
                    setExportOpen(open);
                    if (!open) setExportError("");
                  }}
                >
                  <Button
                    type="button"
                    onClick={() => {
                      setExportError("");
                      setNotice("");
                      setExportOpen(true);
                    }}
                  >
                    Nueva exportación
                  </Button>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nueva exportación</DialogTitle>
                      <DialogDescription>
                        Clasificación (imágenes + CSV)
                      </DialogDescription>
                    </DialogHeader>
                    <dl className="rounded-md border p-3 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Ítems aprobados</dt>
                        <dd>{dataset.approvedCount}</dd>
                      </div>
                    </dl>
                    {exportError && (
                      <p role="alert" className="text-destructive text-sm">
                        {exportError}
                      </p>
                    )}
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={exporting}
                        onClick={() => setExportOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        disabled={exporting}
                        onClick={() => void generateClassificationExport()}
                      >
                        {exporting ? "Generando exportación…" : "Generar exportación"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            {exportsLoading ? (
              <p role="status" className="text-muted-foreground text-sm">
                Cargando exportaciones…
              </p>
            ) : exportsError ? (
              <div role="alert" className="space-y-2">
                <p className="text-destructive text-sm">{exportsError}</p>
                <Button type="button" variant="outline" onClick={() => void loadExports()}>
                  Reintentar
                </Button>
              </div>
            ) : exports.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Aún no hay exportaciones para este dataset.
              </p>
            ) : (
              <ul className="space-y-3">
                {exports.map((datasetExport) => (
                  <li key={datasetExport.id} className="rounded-md border p-3 text-sm">
                    <dl className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">Formato</dt>
                        <dd>Clasificación (imágenes + CSV)</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Versión del dataset</dt>
                        <dd>v{datasetExport.version}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Generada el</dt>
                        <dd>{formatLongDateEs(datasetExport.generatedAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Estado</dt>
                        <dd>Lista</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Imágenes</dt>
                        <dd>{datasetExport.itemCount}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function EvidenceItem({
  item,
  canRemove,
  onRemove,
  onReview,
  onSaveLabel,
}: {
  item: DatasetDetailResponse["items"][number];
  canRemove: boolean;
  onRemove: (itemId: string) => Promise<void>;
  onReview: (itemId: string, status: "approved" | "rejected", reason?: string) => Promise<void>;
  onSaveLabel: (itemId: string, label: string) => Promise<void>;
}) {
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");

  async function confirmRemove() {
    if (removing) return;
    setRemoving(true);
    setRemoveError("");
    try {
      await onRemove(item.id);
      setRemoveOpen(false);
    } catch (removeError) {
      setRemoveError(errorMessage(removeError, "No pudimos retirar la evidencia del dataset."));
    } finally {
      setRemoving(false);
    }
  }

  async function saveReview(status: "approved" | "rejected", reason?: string) {
    if (reviewing) return;
    setReviewing(true);
    setReviewError("");
    try {
      await onReview(item.id, status, reason);
      setReviewOpen(false);
      setReviewReason("");
    } catch (error) {
      setReviewError(errorMessage(error, "No pudimos revisar la evidencia del dataset."));
    } finally {
      setReviewing(false);
    }
  }

  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <code className="text-sm">{item.evidenceId}</code>
        <time className="text-muted-foreground text-sm" dateTime={item.capturedAt}>
          {formatLongDateEs(item.capturedAt)}
        </time>
      </div>
      <Image
        src={item.imageUrl}
        alt={`Evidencia ${item.evidenceId}`}
        width={item.imageWidth}
        height={item.imageHeight}
        unoptimized
        className="mt-3 max-h-80 w-auto max-w-full rounded object-contain"
      />
      {item.taskType === "classification" ? (
        <ReviewedLabelPanel item={item} onSave={onSaveLabel} />
      ) : (
        <p className="mt-2 text-sm">Predicción original: {resultSummary(item.originalResult)}</p>
      )}
      <p className="mt-1 text-sm" data-testid={`dataset-evidence-review-status-${item.id}`}>
        Estado: {reviewStatusLabel(item.reviewStatus)}
      </p>
      {item.reviewedAt && (
        <p className="mt-1 text-muted-foreground text-xs">
          Revisada por {item.reviewerName ?? "un miembro"} · {formatLongDateEs(item.reviewedAt)}
        </p>
      )}
      {item.reviewReason && <p className="mt-1 text-sm">Motivo: {item.reviewReason}</p>}
      <p className="mt-1 text-muted-foreground text-xs">
        Modelo {item.modelId} · versión {item.modelVersion}
      </p>
      {reviewError && !reviewOpen && (
        <p role="alert" className="mt-2 text-destructive text-sm">
          {reviewError}
        </p>
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={reviewing}
          onClick={() => void saveReview("approved")}
        >
          {reviewing ? "Guardando revisión…" : "Aprobar"}
        </Button>
        <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={reviewing}
            onClick={() => {
              setReviewError("");
              setReviewOpen(true);
            }}
          >
            Rechazar
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rechazar evidencia</DialogTitle>
              <DialogDescription>Indica un motivo opcional para el rechazo.</DialogDescription>
            </DialogHeader>
            <label htmlFor={`dataset-evidence-rejection-reason-${item.id}`} className="text-sm">
              Motivo opcional
            </label>
            <textarea
              id={`dataset-evidence-rejection-reason-${item.id}`}
              value={reviewReason}
              maxLength={500}
              disabled={reviewing}
              onChange={(event) => setReviewReason(event.target.value)}
              className="min-h-20 w-full rounded-md border bg-background p-2 text-sm"
            />
            {reviewError && (
              <p role="alert" className="text-destructive text-sm">
                {reviewError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={reviewing}
                onClick={() => setReviewOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={reviewing}
                onClick={() => void saveReview("rejected", reviewReason.trim() || undefined)}
              >
                {reviewing ? "Rechazando evidencia…" : "Rechazar evidencia"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {canRemove && (
        <div className="mt-3 flex justify-end">
          <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setRemoveError("");
                setRemoveOpen(true);
              }}
            >
              Retirar del dataset
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Retirar evidencia</DialogTitle>
                <DialogDescription>
                  La evidencia se conservará, pero no se incluirá en futuras exportaciones.
                </DialogDescription>
              </DialogHeader>
              {removeError && (
                <p role="alert" className="text-destructive text-sm">
                  {removeError}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={removing}
                  onClick={() => setRemoveOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="button" disabled={removing} onClick={() => void confirmRemove()}>
                  {removing ? "Retirando evidencia…" : "Retirar evidencia"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </li>
  );
}

function ReviewedLabelPanel({
  item,
  onSave,
}: {
  item: DatasetDetailResponse["items"][number];
  onSave: (itemId: string, label: string) => Promise<void>;
}) {
  const id = useId();
  const [label, setLabel] = useState(item.reviewedLabel ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const suggestions = predictedLabels(item.originalResult);

  useEffect(() => {
    setLabel(item.reviewedLabel ?? "");
  }, [item.reviewedLabel]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const trimmed = label.trim();
    if (!trimmed) {
      setError(LABEL_REQUIRED);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(item.id, trimmed);
      setLabel(trimmed);
    } catch (saveError) {
      setError(errorMessage(saveError, "No pudimos guardar la etiqueta revisada."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="mt-3 space-y-2 rounded-md border p-3">
      <h3 id={`${id}-title`} className="font-medium text-sm">
        Etiqueta revisada
      </h3>
      <p className="text-sm">Predicción original: {resultSummary(item.originalResult)}</p>
      <p className="text-muted-foreground text-sm">
        {item.reviewedLabel === null
          ? "Sin etiqueta revisada"
          : `Etiqueta revisada: ${item.reviewedLabel}`}
      </p>
      <form noValidate className="space-y-2" onSubmit={(event) => void save(event)}>
        <label htmlFor={`${id}-label`} className="block text-sm">
          Etiqueta correcta
        </label>
        <Input
          id={`${id}-label`}
          value={label}
          required
          maxLength={DATASET_LABEL_MAX_LENGTH}
          list={`${id}-suggestions`}
          disabled={saving}
          aria-invalid={error ? true : undefined}
          onChange={(event) => setLabel(event.target.value)}
        />
        <datalist id={`${id}-suggestions`}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => {
              setLabel(item.reviewedLabel ?? "");
              setError("");
            }}
          >
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Guardando etiqueta…" : "Guardar etiqueta"}
          </Button>
        </div>
      </form>
    </section>
  );
}

/** The labels a classification prediction names, offered as suggestions for the reviewed label. */
function predictedLabels(result: Record<string, unknown>) {
  const labels = typeof result.label === "string" ? [result.label] : [];
  if (typeof result.confidences === "object" && result.confidences !== null) {
    labels.push(...Object.keys(result.confidences));
  }
  return [...new Set(labels)];
}

function reviewStatusLabel(status: DatasetDetailResponse["items"][number]["reviewStatus"]) {
  switch (status) {
    case "approved":
      return "Aprobada";
    case "rejected":
      return "Rechazada";
    default:
      return "Pendiente";
  }
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
    const predictions = result.detections.flatMap((detection) => {
      if (typeof detection !== "object" || detection === null || !("label" in detection)) {
        return [];
      }
      const label = detection.label;
      if (typeof label !== "string") return [];
      const details: string[] = [];
      if ("confidence" in detection && typeof detection.confidence === "number") {
        details.push(`${Math.round(detection.confidence * 100)}%`);
      }
      if (
        "box" in detection &&
        typeof detection.box === "object" &&
        detection.box !== null &&
        "xMin" in detection.box &&
        typeof detection.box.xMin === "number" &&
        "xMax" in detection.box &&
        typeof detection.box.xMax === "number" &&
        "yMin" in detection.box &&
        typeof detection.box.yMin === "number" &&
        "yMax" in detection.box &&
        typeof detection.box.yMax === "number"
      ) {
        const { xMin, xMax, yMin, yMax } = detection.box;
        details.push(
          `caja x ${Math.round(xMin * 100)}–${Math.round(xMax * 100)}%, y ${Math.round(yMin * 100)}–${Math.round(yMax * 100)}%`,
        );
      }
      return [`${label}${details.length ? ` (${details.join("; ")})` : ""}`];
    });
    return predictions.length
      ? `${result.detections.length} detecciones: ${predictions.join(", ")}`
      : `${result.detections.length} detecciones`;
  }
  return "Resultado guardado";
}
