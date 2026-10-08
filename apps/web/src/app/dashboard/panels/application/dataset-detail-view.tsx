"use client";

import {
  DATASET_LABEL_MAX_LENGTH,
  type DatasetAnnotation,
  type DatasetAnnotationsResponse,
  type DatasetAvailableEvidenceResponse,
  type DatasetDetailResponse,
  type DatasetEvidence,
  type DatasetExport,
  type DatasetExportDownloadResponse,
  type DatasetExportFormat,
  type DatasetExportInvalidAnnotationsResponse,
  type DatasetExportInvalidItem,
  type DatasetExportListResponse,
  type DatasetExportResponse,
  type DatasetFilterOptions,
  type DatasetItemFilters,
  type DatasetLabelResponse,
  type DatasetReviewResponse,
  type DatasetValidationResponse,
  parseDatasetItemsQuery,
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
import { ReviewedAnnotationsPanel } from "./reviewed-annotations-panel";

const NOT_FOUND = "No encontramos este dataset.";
const LOAD_ERROR = "No pudimos cargar el dataset.";
const MAX_EVIDENCE_PER_ADD = 500;
const LABEL_REQUIRED = "Ingresa una etiqueta para una evidencia aprobada.";
const EXPORT_FORMAT_COPY: Record<
  DatasetExportFormat,
  { label: string; failure: string; shortName: string }
> = {
  classification_images_csv: {
    label: "Clasificación (imágenes + CSV)",
    failure: "No pudimos generar la exportación de clasificación.",
    shortName: "",
  },
  detection_coco: {
    label: "Detección (COCO)",
    failure: "No pudimos generar la exportación COCO.",
    shortName: "COCO",
  },
  detection_yolo: {
    label: "Detección (YOLO)",
    failure: "No pudimos generar la exportación YOLO.",
    shortName: "YOLO",
  },
};

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
  const [appliedFilters, setAppliedFilters] = useState<DatasetItemFilters>({});
  const [filtering, setFiltering] = useState(false);
  const [filterError, setFilterError] = useState("");
  const [exports, setExports] = useState<DatasetExport[]>([]);
  const [exportsLoading, setExportsLoading] = useState(true);
  const [exportsError, setExportsError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloadingExportId, setDownloadingExportId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<DatasetExportFormat>(
    "classification_images_csv",
  );
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportSummaryLoading, setExportSummaryLoading] = useState(false);
  const [exportSummaryError, setExportSummaryError] = useState("");
  const [exportSummary, setExportSummary] = useState<DatasetValidationResponse | null>(null);
  const [exportInvalidItems, setExportInvalidItems] = useState<DatasetExportInvalidItem[]>([]);
  const [exportInvalidItemCount, setExportInvalidItemCount] = useState(0);
  const [tab, setTab] = useState("evidences");
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<DatasetValidationResponse | null>(null);
  const [validationOpen, setValidationOpen] = useState(false);
  const [validationError, setValidationError] = useState("");
  // The item "Revisar evidencia" brings into view once it is rendered.
  const [revealItemId, setRevealItemId] = useState<string | null>(null);
  // True until the dialog "Revisar evidencia" closes gives up focus, which would undo the reveal.
  const [closingForReview, setClosingForReview] = useState(false);
  // Remounts the filter bar so it shows filters applied from outside it.
  const [filterBarKey, setFilterBarKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const itemsAbortRef = useRef<AbortController | null>(null);
  const availableAbortRef = useRef<AbortController | null>(null);
  const exportsAbortRef = useRef<AbortController | null>(null);
  const validationAbortRef = useRef<AbortController | null>(null);
  const exportSummaryAbortRef = useRef<AbortController | null>(null);
  // The closing dialog keeps its first handlers while it animates out, so they read this ref.
  const closingForReviewRef = useRef(false);
  const retiredEvidenceIdsRef = useRef(new Set<string>());
  // The filters of the loaded items, which every later page and reload repeats.
  const appliedFiltersRef = useRef<DatasetItemFilters>({});
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
      // A reload replaces any filter request still in flight; it keeps the applied filters.
      setFiltering(false);
      setNotFound(false);
      setError("");
      setItemsError("");
      try {
        const { data } = await httpClient.get<DatasetDetailResponse>(
          `/applications/${encodeURIComponent(application.id)}/datasets/${encodeURIComponent(datasetId)}`,
          { params: appliedFiltersRef.current, signal: controller.signal },
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
      const { data } = await httpClient.get<DatasetExportListResponse>(exportsUrl, {
        signal: controller.signal,
      });
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
        { params: { ...appliedFiltersRef.current, offset }, signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setDetail((current) =>
          current
            ? {
                ...current,
                items: [
                  ...current.items,
                  ...data.items.filter(
                    (item) => !current.items.some((loaded) => loaded.id === item.id),
                  ),
                ],
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

  /**
   * Loads the first page of the evidence that matches `filters`. A failure
   * keeps the evidence and filters already shown and reports it in the filter
   * bar.
   */
  async function loadFilteredItems(filters: DatasetItemFilters) {
    abortRef.current?.abort();
    itemsAbortRef.current?.abort();
    setItemsLoading(false);
    const controller = new AbortController();
    abortRef.current = controller;
    setFiltering(true);
    setFilterError("");
    setItemsError("");
    try {
      const { data } = await httpClient.get<DatasetDetailResponse>(
        `/applications/${encodeURIComponent(application.id)}/datasets/${encodeURIComponent(datasetId)}`,
        { params: filters, signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      appliedFiltersRef.current = filters;
      setAppliedFilters(filters);
      setDetail(data);
    } catch (loadError) {
      if (!controller.signal.aborted) setFilterError(errorMessage(loadError, LOAD_ERROR));
    } finally {
      if (!controller.signal.aborted) setFiltering(false);
    }
  }

  function applyFilters(draft: FilterDraft) {
    const parsed = parseDatasetItemsQuery(filterDraftQuery(draft));
    if (!parsed.success) {
      setFilterError(parsed.error.message);
      return;
    }
    const { offset: _offset, ...filters } = parsed.data;
    void loadFilteredItems(filters);
  }

  function clearFilters() {
    setFilterError("");
    if (Object.keys(appliedFiltersRef.current).length > 0) void loadFilteredItems({});
  }

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

  async function loadExportSummary(format: DatasetExportFormat = exportFormat) {
    if (detail?.dataset.taskType !== "detection") return;
    exportSummaryAbortRef.current?.abort();
    const controller = new AbortController();
    exportSummaryAbortRef.current = controller;
    setExportSummary(null);
    setExportSummaryLoading(true);
    setExportSummaryError("");
    try {
      const { data } = await httpClient.get<DatasetValidationResponse>(
        `/applications/${encodeURIComponent(application.id)}/datasets/${encodeURIComponent(datasetId)}/validation`,
        { params: { format }, signal: controller.signal },
      );
      if (!controller.signal.aborted) setExportSummary(data);
    } catch (summaryError) {
      if (!controller.signal.aborted) {
        setExportSummaryError(
          errorMessage(summaryError, "No pudimos cargar el resumen del dataset."),
        );
      }
    } finally {
      if (!controller.signal.aborted) setExportSummaryLoading(false);
    }
  }

  function openExportDialog() {
    setExportError("");
    setExportInvalidItems([]);
    setExportInvalidItemCount(0);
    setExportSummaryError("");
    setNotice("");
    const format =
      detail?.dataset.taskType === "detection" ? "detection_coco" : "classification_images_csv";
    setExportFormat(format);
    setExportOpen(true);
    if (detail?.dataset.taskType === "detection") void loadExportSummary(format);
  }

  async function generateDatasetExport(format: DatasetExportFormat) {
    const isDetectionFormat = format === "detection_coco" || format === "detection_yolo";
    if (
      !canManage ||
      application.status !== "active" ||
      detail?.dataset.taskType !== (isDetectionFormat ? "detection" : "classification") ||
      exporting
    ) {
      return;
    }
    setExporting(true);
    setExportError("");
    setExportInvalidItems([]);
    setExportInvalidItemCount(0);
    setNotice("");
    try {
      const { data } = await httpClient.post<DatasetExportResponse>(exportsUrl, { format });
      setExports((current) => [data.export, ...current]);
      setExportOpen(false);
      setNotice("Tu exportación está lista para descargarse.");
    } catch (saveError) {
      const responseData = axios.isAxiosError<{
        code?: string;
        invalidItems?: DatasetExportInvalidAnnotationsResponse["invalidItems"];
        invalidItemCount?: number;
      }>(saveError)
        ? saveError.response?.data
        : undefined;
      if (responseData?.code === "datasetExportInvalidAnnotations") {
        setExportError("Corrige las anotaciones indicadas antes de exportar.");
        setExportInvalidItems(responseData.invalidItems ?? []);
        setExportInvalidItemCount(responseData.invalidItemCount ?? 0);
      } else if (
        responseData?.code === "datasetExportNeedsTwoItems" ||
        responseData?.code === "datasetExportNoYoloClasses"
      ) {
        setExportError("Corrige las anotaciones indicadas antes de exportar.");
      } else {
        setExportError(errorMessage(saveError, EXPORT_FORMAT_COPY[format].failure));
      }
    } finally {
      setExporting(false);
    }
  }

  async function downloadDatasetExport(exportId: string) {
    if (downloadingExportId) return;
    setDownloadingExportId(exportId);
    setDownloadError("");
    try {
      const { data } = await httpClient.get<DatasetExportDownloadResponse>(
        `${exportsUrl}/${encodeURIComponent(exportId)}/download`,
      );
      window.location.assign(data.downloadUrl);
    } catch (error) {
      setDownloadError(
        errorMessage(error, "No pudimos preparar la descarga de la exportación."),
      );
    } finally {
      setDownloadingExportId(null);
    }
  }

  /** Validates the dataset for export with the rules every export applies (US-084); it changes nothing. */
  async function validateDataset() {
    if (validating) return;
    validationAbortRef.current?.abort();
    const controller = new AbortController();
    validationAbortRef.current = controller;
    // A dialog replaced before it finished closing never gives focus back, so start clean.
    closingForReviewRef.current = false;
    setClosingForReview(false);
    setValidating(true);
    setValidation(null);
    setValidationError("");
    const format =
      detail?.dataset.taskType === "detection"
        ? exportFormat === "detection_yolo"
          ? exportFormat
          : "detection_coco"
        : "classification_images_csv";
    try {
      const { data } = await httpClient.get<DatasetValidationResponse>(
        `/applications/${encodeURIComponent(application.id)}/datasets/${encodeURIComponent(datasetId)}/validation`,
        { params: { format }, signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setValidation(data);
      setValidationOpen(!data.ready);
    } catch (validateError) {
      if (!controller.signal.aborted) {
        setValidationError(errorMessage(validateError, "No pudimos validar el dataset."));
      }
    } finally {
      if (!controller.signal.aborted) setValidating(false);
    }
  }

  /**
   * Takes the reviewer to an item that requires review in `Evidencias`. An
   * item not loaded yet is approved, so it is fetched directly; that filter
   * stays applied, as the bar shows.
   */
  async function reviewInvalidItem(itemId: string) {
    closingForReviewRef.current = true;
    setClosingForReview(true);
    setValidationOpen(false);
    setTab("evidences");
    if (detail?.items.some((item) => item.id === itemId)) {
      setRevealItemId(itemId);
      return;
    }
    abortRef.current?.abort();
    itemsAbortRef.current?.abort();
    setItemsLoading(false);
    const controller = new AbortController();
    abortRef.current = controller;
    const filters: DatasetItemFilters = { status: "approved" };
    const url = `/applications/${encodeURIComponent(application.id)}/datasets/${encodeURIComponent(datasetId)}`;
    setFiltering(true);
    setFilterError("");
    setItemsError("");
    try {
      const { data: page } = await httpClient.get<DatasetDetailResponse>(url, {
        params: filters,
        signal: controller.signal,
      });
      let items = page.items;
      if (!items.some((item) => item.id === itemId)) {
        try {
          const { data: item } = await httpClient.get<DatasetDetailResponse["items"][number]>(
            `${url}/evidence/${encodeURIComponent(itemId)}`,
            { signal: controller.signal },
          );
          items = [...items, item];
        } catch (itemError) {
          // The item may have been retired after validation; the approved page is still useful.
          if (!axios.isAxiosError(itemError) || itemError.response?.status !== 404) throw itemError;
        }
      }
      if (controller.signal.aborted) return;
      appliedFiltersRef.current = filters;
      setAppliedFilters(filters);
      setFilterBarKey((key) => key + 1);
      setDetail({ ...page, items });
      if (items.some((item) => item.id === itemId)) setRevealItemId(itemId);
    } catch (loadError) {
      if (!controller.signal.aborted) setFilterError(errorMessage(loadError, LOAD_ERROR));
    } finally {
      if (!controller.signal.aborted) setFiltering(false);
    }
  }

  useEffect(() => {
    if (!revealItemId || tab !== "evidences" || closingForReview) return;
    const element = document.getElementById(datasetItemElementId(revealItemId));
    if (!element) return;
    element.scrollIntoView?.({ block: "center" });
    element.focus();
    setRevealItemId(null);
  }, [closingForReview, revealItemId, tab]);

  async function removeEvidence(itemId: string) {
    if (!canManage || application.status !== "active") return;
    setNotice("");
    await httpClient.delete(
      `/applications/${encodeURIComponent(application.id)}/datasets/${encodeURIComponent(datasetId)}/evidence/${encodeURIComponent(itemId)}`,
    );
    retiredEvidenceIdsRef.current.add(itemId);
    const filters = appliedFiltersRef.current;
    setDetail((current) => {
      if (!current) return current;
      const items = current.items.filter((item) => item.id !== itemId);
      if (items.length === current.items.length) return current;
      const removed = current.items.find((item) => item.id === itemId);
      // Only an item the server still counts in the filtered pages moves them back.
      const offsetChange = removed && countsInFilteredPages(removed.reviewStatus, filters) ? -1 : 0;
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
        nextItemOffset: shiftItemOffset(current.nextItemOffset, offsetChange),
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
    const filters = appliedFiltersRef.current;
    setDetail((current) => {
      if (!current) return current;
      const oldItem = current.items.find((item) => item.id === itemId);
      const countChange = oldItem
        ? Number(data.status === "approved") - Number(oldItem.reviewStatus === "approved")
        : 0;
      // An item leaving the status filter moves the later filtered pages back by one, and one
      // coming back into it moves them forward again.
      const offsetChange = oldItem
        ? Number(countsInFilteredPages(data.status, filters)) -
          Number(countsInFilteredPages(oldItem.reviewStatus, filters))
        : 0;
      return {
        ...current,
        nextItemOffset: shiftItemOffset(current.nextItemOffset, offsetChange),
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

  async function saveAnnotations(itemId: string, annotations: DatasetAnnotation[]) {
    const { data } = await httpClient.put<DatasetAnnotationsResponse>(
      `/applications/${encodeURIComponent(application.id)}/datasets/${encodeURIComponent(datasetId)}/evidence/${encodeURIComponent(itemId)}/annotations`,
      { annotations },
    );
    if (retiredEvidenceIdsRef.current.has(itemId)) return;
    setDetail((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === itemId
                ? { ...item, reviewedAnnotations: data.reviewedAnnotations }
                : item,
            ),
          }
        : current,
    );
    setNotice("Anotaciones revisadas guardadas.");
  }

  useEffect(() => {
    void loadDetail();
    void loadExports();
    return () => {
      abortRef.current?.abort();
      itemsAbortRef.current?.abort();
      exportsAbortRef.current?.abort();
      validationAbortRef.current?.abort();
      exportSummaryAbortRef.current?.abort();
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

      <Tabs value={tab} onValueChange={setTab}>
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
        <TabsContent value="evidences" className="space-y-3">
          <EvidenceFilterBar
            key={filterBarKey}
            options={detail.filterOptions}
            applied={appliedFilters}
            busy={filtering}
            error={filterError}
            onApply={applyFilters}
            onClear={clearFilters}
          />
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {Object.keys(appliedFilters).length > 0
                ? "No hay evidencias que coincidan con los filtros."
                : "Aún no hay evidencias en este dataset."}
            </p>
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
                  onSaveAnnotations={saveAnnotations}
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
              disabled={itemsLoading || filtering}
              onClick={() => void loadMoreDatasetItems()}
            >
              {itemsLoading ? "Cargando evidencias…" : "Cargar más evidencias del dataset"}
            </Button>
          )}
        </TabsContent>
        <TabsContent value="exports">
          <div className="space-y-4">
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                disabled={validating}
                onClick={() => void validateDataset()}
              >
                {validating ? "Validando dataset…" : "Validar dataset"}
              </Button>
              {validation?.ready && (
                <p role="status" className="text-sm">
                  El dataset está listo para exportarse.
                </p>
              )}
              {validationError && (
                <p role="alert" className="text-destructive text-sm">
                  {validationError}
                </p>
              )}
            </div>
            {canManage &&
              application.status === "active" &&
              (dataset.taskType === "classification" || dataset.taskType === "detection") && (
                <Dialog
                  open={exportOpen}
                  onOpenChange={(open) => {
                    setExportOpen(open);
                    if (!open) {
                      setExportError("");
                      setExportInvalidItems([]);
                      setExportInvalidItemCount(0);
                    }
                  }}
                >
                  <Button type="button" onClick={openExportDialog}>
                    Nueva exportación
                  </Button>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nueva exportación</DialogTitle>
                      <DialogDescription>
                        {EXPORT_FORMAT_COPY[exportFormat].label}
                      </DialogDescription>
                    </DialogHeader>
                    {dataset.taskType === "detection" && (
                      <fieldset className="flex gap-2">
                        <legend className="sr-only">Formato de exportación</legend>
                        <Button
                          type="button"
                          variant={exportFormat === "detection_coco" ? "default" : "outline"}
                          aria-pressed={exportFormat === "detection_coco"}
                          disabled={exporting}
                          onClick={() => {
                            setExportFormat("detection_coco");
                            void loadExportSummary("detection_coco");
                          }}
                        >
                          Detección (COCO)
                        </Button>
                        <Button
                          type="button"
                          variant={exportFormat === "detection_yolo" ? "default" : "outline"}
                          aria-pressed={exportFormat === "detection_yolo"}
                          disabled={exporting}
                          onClick={() => {
                            setExportFormat("detection_yolo");
                            void loadExportSummary("detection_yolo");
                          }}
                        >
                          Detección (YOLO)
                        </Button>
                      </fieldset>
                    )}
                    {dataset.taskType === "classification" && (
                      <p className="text-muted-foreground text-sm">
                        Tamaño total máximo de imágenes: 128 MiB.
                      </p>
                    )}
                    <dl className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-3">
                      {dataset.taskType === "detection" ? (
                        <>
                          <div className="flex justify-between gap-4">
                            <dt className="text-muted-foreground">Imágenes</dt>
                            <dd>{exportSummary?.approvedCount ?? dataset.approvedCount}</dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-muted-foreground">
                              {exportFormat === "detection_yolo" ? "Etiquetas" : "Anotaciones"}
                            </dt>
                            <dd>
                              {exportSummaryLoading ? "…" : (exportSummary?.annotationCount ?? "—")}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-muted-foreground">
                              {exportFormat === "detection_yolo" ? "Clases" : "Categorías"}
                            </dt>
                            <dd>
                              {exportSummaryLoading ? "…" : (exportSummary?.categoryCount ?? "—")}
                            </dd>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Ítems aprobados</dt>
                          <dd>{dataset.approvedCount}</dd>
                        </div>
                      )}
                    </dl>
                    {exportSummaryLoading && (
                      <p role="status" className="text-muted-foreground text-sm">
                        Cargando resumen…
                      </p>
                    )}
                    {exportSummaryError && (
                      <div role="alert" className="space-y-2">
                        <p className="text-destructive text-sm">{exportSummaryError}</p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void loadExportSummary()}
                        >
                          Reintentar resumen
                        </Button>
                      </div>
                    )}
                    {exporting && (
                      <p role="status" className="text-sm">
                        Estado: Generando
                      </p>
                    )}
                    {exportError && (
                      <div role="alert" className="space-y-1">
                        <p className="font-medium">Estado: Fallida</p>
                        <p className="text-destructive text-sm">{exportError}</p>
                      </div>
                    )}
                    {exportInvalidItems.length > 0 && (
                      <div className="space-y-2">
                        {exportInvalidItemCount > exportInvalidItems.length && (
                          <p className="text-muted-foreground text-sm">
                            Se muestran los primeros {exportInvalidItems.length} de{" "}
                            {exportInvalidItemCount} ítems.
                          </p>
                        )}
                        <ul className="space-y-2">
                          {exportInvalidItems.map((invalid) => (
                            <li key={invalid.itemId} className="rounded-md border p-3 text-sm">
                              <p>
                                Ítem <code>{invalid.itemId}</code> · evidencia {invalid.evidenceId}
                              </p>
                              <p className="text-muted-foreground">{invalid.cause.message}</p>
                              <a
                                href={`#${datasetItemElementId(invalid.itemId)}`}
                                className="text-primary underline-offset-4 hover:underline"
                                onClick={(event) => {
                                  event.preventDefault();
                                  setExportOpen(false);
                                  void reviewInvalidItem(invalid.itemId);
                                }}
                              >
                                Revisar evidencia
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
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
                        disabled={exporting || exportSummaryLoading}
                        onClick={() =>
                          void generateDatasetExport(
                            dataset.taskType === "detection"
                              ? exportFormat
                              : "classification_images_csv",
                          )
                        }
                      >
                        {exporting
                          ? "Generando exportación…"
                          : dataset.taskType === "detection"
                            ? `Generar exportación ${EXPORT_FORMAT_COPY[exportFormat].shortName}`
                            : "Generar exportación"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            {downloadError && (
              <p role="alert" className="text-destructive text-sm">
                {downloadError}
              </p>
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
                        <dd>{EXPORT_FORMAT_COPY[datasetExport.format].label}</dd>
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
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={downloadingExportId !== null}
                        onClick={() => void downloadDatasetExport(datasetExport.id)}
                      >
                        {downloadingExportId === datasetExport.id
                          ? "Preparando descarga…"
                          : "Descargar"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>
      {validation && !validation.ready && (
        <Dialog open={validationOpen} onOpenChange={setValidationOpen}>
          <DialogContent
            className="max-h-[85vh] overflow-y-auto"
            onCloseAutoFocus={(event) => {
              if (!closingForReviewRef.current) return;
              event.preventDefault();
              closingForReviewRef.current = false;
              setClosingForReview(false);
            }}
          >
            <DialogHeader>
              <DialogTitle>Ítems que requieren revisión</DialogTitle>
              <DialogDescription>
                Corrige estas evidencias aprobadas antes de exportar el dataset.
              </DialogDescription>
            </DialogHeader>
            {validation.problem && <p className="text-sm">{validation.problem.message}</p>}
            {validation.invalidItemCount > validation.invalidItems.length && (
              <p className="text-muted-foreground text-sm">
                Se muestran los primeros {validation.invalidItems.length} de{" "}
                {validation.invalidItemCount} ítems que requieren revisión.
              </p>
            )}
            <ul className="space-y-3">
              {validation.invalidItems.map((invalid) => (
                <li key={invalid.itemId} className="flex gap-3 rounded-md border p-3">
                  <Image
                    src={invalid.imageUrl}
                    alt={`Evidencia ${invalid.evidenceId}`}
                    width={invalid.imageWidth}
                    height={invalid.imageHeight}
                    unoptimized
                    className="h-20 w-auto max-w-28 rounded object-contain"
                  />
                  <div className="min-w-0 space-y-1 text-sm">
                    <code className="block truncate text-xs">{invalid.evidenceId}</code>
                    <p>{invalid.cause.message}</p>
                    <a
                      href={`#${datasetItemElementId(invalid.itemId)}`}
                      className="text-primary underline-offset-4 hover:underline"
                      onClick={(event) => {
                        event.preventDefault();
                        void reviewInvalidItem(invalid.itemId);
                      }}
                    >
                      Revisar evidencia
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

/** The element of a dataset item in `Evidencias`, which "Revisar evidencia" links to. */
function datasetItemElementId(itemId: string) {
  return `dataset-item-${itemId}`;
}

/**
 * Whether the server counts a loaded item with this review status in the
 * filtered pages, and so in `nextItemOffset`. Only the status filter can change
 * after loading: the other filters read data a review never touches.
 */
function countsInFilteredPages(
  status: DatasetDetailResponse["items"][number]["reviewStatus"],
  filters: DatasetItemFilters,
) {
  return filters.status === undefined || status === filters.status;
}

function shiftItemOffset(offset: number | null, change: number) {
  return offset === null ? null : Math.max(0, offset + change);
}

type FilterDraft = {
  status: string;
  workflowId: string;
  modelId: string;
  capturedFrom: string;
  capturedTo: string;
  minConfidence: string;
  maxConfidence: string;
};

/** A confidence from 0 to 1 as the percent the bar shows, without floating-point noise. */
function confidencePercent(confidence: number | undefined) {
  return confidence === undefined ? "" : String(Math.round(confidence * 10_000) / 100);
}

/** The bar's fields for the applied filters, so a remounted bar shows what the list is filtered by. */
function appliedFilterDraft(filters: DatasetItemFilters): FilterDraft {
  return {
    status: filters.status ?? "",
    workflowId: filters.workflowId ?? "",
    modelId: filters.modelId ?? "",
    capturedFrom: filters.capturedFrom ?? "",
    capturedTo: filters.capturedTo ?? "",
    minConfidence: confidencePercent(filters.minConfidence),
    maxConfidence: confidencePercent(filters.maxConfidence),
  };
}

/** The query of the filled filters; the bar shows confidences in percent and the API reads 0 to 1. */
function filterDraftQuery(draft: FilterDraft) {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (!value.trim()) continue;
    query[key] =
      key === "minConfidence" || key === "maxConfidence" ? String(Number(value) / 100) : value;
  }
  return query;
}

function EvidenceFilterBar({
  options,
  applied,
  busy,
  error,
  onApply,
  onClear,
}: {
  options: DatasetFilterOptions;
  applied: DatasetItemFilters;
  busy: boolean;
  error: string;
  onApply: (draft: FilterDraft) => void;
  onClear: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => appliedFilterDraft(applied));
  const field = (key: keyof FilterDraft) => ({
    id: `${id}-${key}`,
    value: draft[key],
    disabled: busy,
    onChange: (event: { target: { value: string } }) =>
      setDraft((current) => ({ ...current, [key]: event.target.value })),
    className: "h-9 w-full rounded-md border bg-background px-3 text-sm",
  });

  return (
    <form
      aria-labelledby={`${id}-title`}
      noValidate
      className="space-y-3 rounded-md border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draft);
      }}
    >
      <h3 id={`${id}-title`} className="font-medium text-sm">
        Filtrar evidencias
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1 text-sm">
          <label htmlFor={`${id}-status`}>Estado</label>
          <select {...field("status")}>
            <option value="">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="approved">Aprobada</option>
            <option value="rejected">Rechazada</option>
          </select>
        </div>
        <div className="space-y-1 text-sm">
          <label htmlFor={`${id}-workflowId`}>Workflow</label>
          <select {...field("workflowId")}>
            <option value="">Todos</option>
            {options.workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1 text-sm">
          <label htmlFor={`${id}-modelId`}>Modelo</label>
          <select {...field("modelId")}>
            <option value="">Todos</option>
            {options.models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="space-y-1 text-sm">
          <legend>Fecha</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">Desde</span>
              <input type="date" {...field("capturedFrom")} />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">Hasta</span>
              <input type="date" {...field("capturedTo")} />
            </label>
          </div>
          <p className="text-muted-foreground text-xs">
            Día de captura en UTC; incluye ambos días.
          </p>
        </fieldset>
        <fieldset className="space-y-1 text-sm">
          <legend>Confianza</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">Mínima (%)</span>
              <input type="number" min={0} max={100} step="any" {...field("minConfidence")} />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">Máxima (%)</span>
              <input type="number" min={0} max={100} step="any" {...field("maxConfidence")} />
            </label>
          </div>
          <p className="text-muted-foreground text-xs">
            En detección se usa la mayor confianza de sus detecciones.
          </p>
        </fieldset>
      </div>
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
          disabled={busy}
          onClick={() => {
            setDraft(appliedFilterDraft({}));
            onClear();
          }}
        >
          Limpiar filtros
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Aplicando filtros…" : "Aplicar filtros"}
        </Button>
      </div>
    </form>
  );
}

function EvidenceItem({
  item,
  canRemove,
  onRemove,
  onReview,
  onSaveLabel,
  onSaveAnnotations,
}: {
  item: DatasetDetailResponse["items"][number];
  canRemove: boolean;
  onRemove: (itemId: string) => Promise<void>;
  onReview: (itemId: string, status: "approved" | "rejected", reason?: string) => Promise<void>;
  onSaveLabel: (itemId: string, label: string) => Promise<void>;
  onSaveAnnotations: (itemId: string, annotations: DatasetAnnotation[]) => Promise<void>;
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
    <li id={datasetItemElementId(item.id)} tabIndex={-1} className="rounded-lg border p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <code className="text-sm">{item.evidenceId}</code>
        <time className="text-muted-foreground text-sm" dateTime={item.capturedAt}>
          {formatLongDateEs(item.capturedAt)}
        </time>
      </div>
      {item.taskType === "classification" ? (
        <>
          <Image
            src={item.imageUrl}
            alt={`Evidencia ${item.evidenceId}`}
            width={item.imageWidth}
            height={item.imageHeight}
            unoptimized
            className="mt-3 max-h-80 w-auto max-w-full rounded object-contain"
          />
          <ReviewedLabelPanel item={item} onSave={onSaveLabel} />
        </>
      ) : (
        <ReviewedAnnotationsPanel
          item={item}
          predictionSummary={resultSummary(item.originalResult)}
          onSave={onSaveAnnotations}
        />
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
