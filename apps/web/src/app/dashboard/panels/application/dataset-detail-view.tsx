"use client";

import type { DatasetDetailResponse } from "@ayni/api/datasets";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/api-error";
import { formatLongDateEs } from "@/lib/format-date";
import { httpClient } from "@/lib/http-client";
import type { Application } from "../../types";

const NOT_FOUND = "No encontramos este dataset.";
const LOAD_ERROR = "No pudimos cargar el dataset.";

export type DatasetDetailViewProps = {
  application: Application;
  datasetId: string;
  onBackToDatasets?: () => void;
};

export function DatasetDetailView({
  application,
  datasetId,
  onBackToDatasets,
}: DatasetDetailViewProps) {
  const [dataset, setDataset] = useState<DatasetDetailResponse["dataset"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const loadDetail = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setNotFound(false);
    setError("");
    try {
      const { data } = await httpClient.get<DatasetDetailResponse>(
        `/applications/${encodeURIComponent(application.id)}/datasets/${encodeURIComponent(datasetId)}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setDataset(data.dataset);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setDataset(null);
      if (axios.isAxiosError(loadError) && loadError.response?.status === 404) {
        setNotFound(true);
      } else {
        setError(errorMessage(loadError, LOAD_ERROR));
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [application.id, datasetId]);

  useEffect(() => {
    void loadDetail();
    return () => abortRef.current?.abort();
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
  if (error || !dataset) {
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
        <TabsList>
          <TabsTrigger value="evidences">Evidencias</TabsTrigger>
          <TabsTrigger value="exports">Exportaciones</TabsTrigger>
        </TabsList>
        <TabsContent value="evidences">
          <p className="text-muted-foreground text-sm">Aún no hay evidencias en este dataset.</p>
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
