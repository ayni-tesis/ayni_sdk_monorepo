"use client";

import { IconRefresh } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api-error";
import { formatLongDateEs } from "@/lib/format-date";
import { httpClient } from "@/lib/http-client";
import { UploadModelVersionDialog } from "./upload-model-version-dialog";

export type ModelVersionListItem = {
  id: string;
  version: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
};

const VERSIONS_LOAD_ERROR = "No pudimos cargar las versiones. Inténtalo nuevamente.";
const VERSIONS_EMPTY_MESSAGE = "Este modelo aún no tiene versiones.";

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatVersionSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const formatted = unit === 0 ? String(value) : value.toFixed(1).replace(/\.0$/, "");
  return `${formatted} ${SIZE_UNITS[unit]}`;
}

export function abbreviateSha256(sha256: string): string {
  return `${sha256.slice(0, 8)}…`;
}

export type ModelVersionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  modelId: string;
  modelName: string;
  canManage?: boolean;
  onVersionUploaded?: () => void;
};

export function ModelVersionsDialog({
  open,
  onOpenChange,
  applicationId,
  modelId,
  modelName,
  canManage = false,
  onVersionUploaded,
}: ModelVersionsDialogProps) {
  const [versions, setVersions] = useState<ModelVersionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteVersion, setDeleteVersion] = useState<ModelVersionListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadVersions = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError("");
    try {
      const { data } = await httpClient.get<{ versions?: ModelVersionListItem[] }>(
        `/applications/${applicationId}/models/${modelId}/versions`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setVersions(Array.isArray(data?.versions) ? data.versions : []);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setError(errorMessage(loadError, VERSIONS_LOAD_ERROR));
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [applicationId, modelId]);

  const confirmDelete = useCallback(async () => {
    if (!deleteVersion) return;
    setDeleting(true);
    setNotice("");
    try {
      await httpClient.delete(
        `/applications/${applicationId}/models/${modelId}/versions/${deleteVersion.id}`,
      );
      setVersions((current) => current.filter((version) => version.id !== deleteVersion.id));
      setDeleteVersion(null);
      toast.success("Versión eliminada.");
      await loadVersions();
      onVersionUploaded?.();
    } catch (deleteError) {
      setNotice(errorMessage(deleteError, "No se pudo eliminar la versión del modelo."));
    } finally {
      setDeleting(false);
    }
  }, [applicationId, deleteVersion, loadVersions, modelId, onVersionUploaded]);

  useEffect(() => {
    if (open) {
      void loadVersions();
    } else {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    }
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [open, loadVersions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Versiones de {modelName}</DialogTitle>
          <DialogDescription>
            Metadatos operativos de cada versión publicada. El archivo del modelo nunca se expone
            aquí.
          </DialogDescription>
        </DialogHeader>

        {notice && <p className="text-destructive text-sm" role="alert">{notice}</p>}

        {canManage && (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              data-testid="upload-version-from-versions"
              onClick={() => setUploadOpen(true)}
            >
              Subir versión
            </Button>
          </div>
        )}

        {loading ? (
          <p data-testid="model-versions-loading" className="text-muted-foreground text-sm">
            Cargando versiones…
          </p>
        ) : error ? (
          <div
            className="applications-error flex items-center gap-3"
            data-testid="model-versions-error"
          >
            <p className="text-destructive text-sm">{error}</p>
            <Button
              variant="outline"
              size="sm"
              data-testid="model-versions-retry"
              onClick={() => void loadVersions()}
            >
              <IconRefresh className="mr-1 size-4" />
              Reintentar
            </Button>
          </div>
        ) : versions.length === 0 ? (
          <p data-testid="model-versions-empty" className="text-muted-foreground text-sm">
            {VERSIONS_EMPTY_MESSAGE}
          </p>
        ) : (
          <table className="model-versions-table w-full text-sm" data-testid="model-versions-table">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 font-medium">Versión</th>
                <th className="pb-2 font-medium">Hash</th>
                <th className="pb-2 font-medium">Tamaño</th>
                <th className="pb-2 font-medium">Subida el</th>
                <th className="pb-2 font-medium">Contrato</th>
                {canManage && <th className="pb-2 font-medium">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr
                  key={version.id}
                  data-testid={`model-version-row-${version.id}`}
                  className="border-b last:border-0"
                >
                  <td className="py-2.5 font-medium">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {version.version}
                    </code>
                  </td>
                  <td className="py-2.5 text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <code
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
                        title={version.sha256}
                      >
                        {abbreviateSha256(version.sha256)}
                      </code>
                      <CopyButton
                        variant="ghost"
                        size="xs"
                        content={version.sha256}
                        data-testid={`copy-hash-${version.id}`}
                        aria-label="Copiar hash"
                        title="Copiar hash"
                      />
                    </div>
                  </td>
                  <td className="py-2.5 text-muted-foreground">
                    {formatVersionSize(version.sizeBytes)}
                  </td>
                  <td className="py-2.5 text-muted-foreground">
                    {formatLongDateEs(version.createdAt)}
                  </td>
                  <td className="py-2.5 text-muted-foreground">—</td>
                  {canManage && <td className="py-2.5 text-right">
                    {canManage && (
                      <Button
                        size="sm"
                        variant="destructive"
                        data-testid={`delete-version-trigger-${version.id}`}
                        onClick={() => setDeleteVersion(version)}
                      >
                        Eliminar
                      </Button>
                    )}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <UploadModelVersionDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          applicationId={applicationId}
          modelId={modelId}
          modelName={modelName}
          onUploaded={() => {
            void loadVersions();
            onVersionUploaded?.();
          }}
        />

        <Dialog open={Boolean(deleteVersion)} onOpenChange={(nextOpen) => !nextOpen && setDeleteVersion(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Eliminar la versión {deleteVersion?.version}?</DialogTitle>
              <DialogDescription>
                Se eliminará el archivo del modelo. Esta acción no se puede deshacer.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteVersion(null)} disabled={deleting}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>
                {deleting ? "Eliminando…" : "Eliminar versión"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
