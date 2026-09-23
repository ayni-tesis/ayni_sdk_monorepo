"use client";

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
import {
  abbreviateSha256,
  formatVersionSize,
  type ModelVersionListItem,
} from "./model-versions-dialog";
import type { ModelItem } from "./models-view";

const NOT_FOUND = "No encontramos este modelo.";
const LOAD_ERROR = "No pudimos cargar el modelo. Inténtalo nuevamente.";

export type ModelDetailViewProps = {
  application: Application;
  modelId: string;
  onBackToModels?: () => void;
};

export function ModelDetailView({ application, modelId, onBackToModels }: ModelDetailViewProps) {
  const [model, setModel] = useState<ModelItem | null>(null);
  const [versions, setVersions] = useState<ModelVersionListItem[]>([]);
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
      const { data } = await httpClient.get<{ models?: ModelItem[] }>(
        `/applications/${application.id}/models`,
        { signal: controller.signal },
      );
      const found = data.models?.find((item) => item.id === modelId);
      if (!found) {
        setModel(null);
        setNotFound(true);
        return;
      }
      const versionResponse = await httpClient.get<{ versions?: ModelVersionListItem[] }>(
        `/applications/${application.id}/models/${encodeURIComponent(modelId)}/versions`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setModel(found);
      setVersions(
        Array.isArray(versionResponse.data.versions) ? versionResponse.data.versions : [],
      );
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setModel(null);
      if (axios.isAxiosError(loadError) && loadError.response?.status === 404) {
        setNotFound(true);
      } else {
        setError(errorMessage(loadError, LOAD_ERROR));
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [application.id, modelId]);

  useEffect(() => {
    void loadDetail();
    return () => abortRef.current?.abort();
  }, [loadDetail]);

  if (loading)
    return (
      <p data-testid="model-detail-loading" className="text-muted-foreground text-sm">
        Cargando modelo…
      </p>
    );
  if (notFound)
    return (
      <p data-testid="model-detail-not-found" className="text-muted-foreground text-sm">
        {NOT_FOUND}
      </p>
    );
  if (error || !model) {
    return (
      <div className="applications-error flex items-center gap-3">
        <p className="text-destructive text-sm">{error || LOAD_ERROR}</p>
        <Button
          variant="outline"
          size="sm"
          data-testid="model-detail-retry"
          onClick={() => void loadDetail()}
        >
          <IconRefresh className="mr-1 size-4" />
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              href={`/dashboard/applications/${application.id}/models`}
              onClick={(event) => {
                if (!onBackToModels) return;
                event.preventDefault();
                onBackToModels();
              }}
            >
              Modelos
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{model.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="space-y-3" data-testid="model-detail-header">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-lg">{model.name}</h2>
          <span className="rounded bg-muted px-2 py-1 text-muted-foreground text-xs">
            TensorFlow Lite
          </span>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">ID del modelo</dt>
            <dd>
              <code>{model.id}</code>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Versiones</dt>
            <dd>{model.versionCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Última actualización</dt>
            <dd>{formatLongDateEs(model.updatedAt)}</dd>
          </div>
        </dl>
      </header>

      <Tabs defaultValue="versions">
        <TabsList>
          <TabsTrigger value="versions">Versiones</TabsTrigger>
        </TabsList>
        <TabsContent value="versions">
          {versions.length === 0 ? (
            <p className="text-muted-foreground text-sm">Este modelo aún no tiene versiones.</p>
          ) : (
            <table className="model-versions-table w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Versión</th>
                  <th className="pb-2 font-medium">Hash</th>
                  <th className="pb-2 font-medium">Tamaño</th>
                  <th className="pb-2 font-medium">Subida el</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => (
                  <tr
                    key={version.id}
                    className="border-b last:border-0"
                    data-testid={`model-version-row-${version.id}`}
                  >
                    <td className="py-2.5 font-medium">
                      <code>{version.version}</code>
                    </td>
                    <td className="py-2.5 text-muted-foreground" title={version.sha256}>
                      <code>{abbreviateSha256(version.sha256)}</code>
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {formatVersionSize(version.sizeBytes)}
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {formatLongDateEs(version.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
