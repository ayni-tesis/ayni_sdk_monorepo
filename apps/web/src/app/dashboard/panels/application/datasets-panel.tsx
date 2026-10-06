"use client";

import type { DatasetListItem, DatasetTaskType } from "@ayni/api/datasets";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { errorMessage } from "@/lib/api-error";
import { httpClient } from "@/lib/http-client";

type DatasetsPanelProps = {
  applicationId: string;
  canManage: boolean;
  applicationStatus: "active" | "archived";
  onOpenDataset?: (datasetId: string) => void;
};

const TASK_TYPES: { value: DatasetTaskType; label: string }[] = [
  { value: "classification", label: "Clasificación" },
  { value: "detection", label: "Detección" },
];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(date);
}

export function DatasetsPanel({
  applicationId,
  canManage,
  applicationStatus,
  onOpenDataset,
}: DatasetsPanelProps) {
  const [datasets, setDatasets] = useState<DatasetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [taskType, setTaskType] = useState<DatasetTaskType | "">("");
  const [createError, setCreateError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const listRequestId = useRef(0);
  const canEdit = canManage && applicationStatus === "active";

  const loadDatasets = useCallback(async () => {
    const requestId = ++listRequestId.current;
    setLoading(true);
    setListError("");
    try {
      const { data } = await httpClient.get<{ datasets: DatasetListItem[] }>(
        `/applications/${applicationId}/datasets`,
      );
      if (requestId === listRequestId.current) setDatasets(data.datasets);
    } catch {
      if (requestId === listRequestId.current) {
        setListError("No pudimos cargar los datasets.");
      }
    } finally {
      if (requestId === listRequestId.current) setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void loadDatasets();
    return () => {
      listRequestId.current++;
    };
  }, [loadDatasets]);

  function changeOpen(nextOpen: boolean) {
    if (creating) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setName("");
      setTaskType("");
      setCreateError("");
    } else {
      setNotice("");
    }
  }

  async function createDataset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || creating) return;
    if (!name.trim()) {
      setCreateError("Ingresa un nombre para el dataset.");
      return;
    }
    if (!taskType) {
      setCreateError("Selecciona el tipo de tarea.");
      return;
    }

    setCreating(true);
    setCreateError("");
    setNotice("");
    try {
      await httpClient.post(`/applications/${applicationId}/datasets`, {
        name: name.trim(),
        taskType,
      });
      setNotice("Dataset creado.");
      setOpen(false);
      setName("");
      setTaskType("");
      await loadDatasets();
    } catch (error) {
      setCreateError(errorMessage(error, "No se pudo crear el dataset."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="datasets-heading">
      <header className="flex items-center justify-between gap-4">
        <h2 id="datasets-heading" className="font-semibold text-xl">
          Datasets
        </h2>
        {canEdit && (
          <Dialog open={open} onOpenChange={changeOpen}>
            <Button type="button" onClick={() => changeOpen(true)}>
              Crear dataset
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear dataset</DialogTitle>
                <DialogDescription>
                  Organiza evidencias de una aplicación según su tipo de tarea.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={createDataset} noValidate className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label htmlFor="dataset-name" className="font-semibold text-sm">
                    Nombre del dataset
                  </label>
                  <Input
                    id="dataset-name"
                    autoFocus
                    required
                    aria-required="true"
                    maxLength={160}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      if (createError) setCreateError("");
                    }}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="dataset-task-type" className="font-semibold text-sm">
                    Tipo de tarea
                  </label>
                  <select
                    id="dataset-task-type"
                    required
                    aria-required="true"
                    value={taskType}
                    onChange={(event) => {
                      setTaskType(event.target.value as DatasetTaskType | "");
                      if (createError) setCreateError("");
                    }}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">Selecciona una opción</option>
                    {TASK_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                {createError && (
                  <p className="text-destructive text-sm" role="alert">
                    {createError}
                  </p>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={creating}
                    onClick={() => changeOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" data-testid="create-dataset-submit" disabled={creating}>
                    {creating ? "Creando dataset…" : "Crear dataset"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </header>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {loading && <p role="status">Cargando datasets…</p>}
      {!loading && listError && (
        <div className="space-y-2" role="alert">
          <p>{listError}</p>
          <Button type="button" variant="outline" onClick={() => void loadDatasets()}>
            Reintentar
          </Button>
        </div>
      )}
      {!loading && !listError && datasets.length === 0 && (
        <p className="rounded-lg border p-4 text-muted-foreground text-sm">
          Aún no hay datasets en esta aplicación.
        </p>
      )}
      {!loading && !listError && datasets.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="p-3">Nombre</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Evidencias</th>
                <th className="p-3">Aprobadas</th>
                <th className="p-3">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((dataset) => (
                <tr key={dataset.id} className="border-b last:border-0">
                  <td className="p-3">
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={() => onOpenDataset?.(dataset.id)}
                    >
                      {dataset.name}
                    </button>
                    <p className="font-mono text-muted-foreground text-xs">{dataset.id}</p>
                  </td>
                  <td className="p-3">
                    {TASK_TYPES.find((type) => type.value === dataset.taskType)?.label ??
                      dataset.taskType}
                  </td>
                  <td className="p-3">{dataset.evidenceCount}</td>
                  <td className="p-3">{dataset.approvedCount}</td>
                  <td className="p-3">
                    <time dateTime={dataset.createdAt}>{formatDate(dataset.createdAt)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
