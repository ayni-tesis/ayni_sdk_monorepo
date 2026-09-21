"use client";

import { IconCpu, IconRefresh } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import type { Application } from "../../types";
import { UploadModelVersionDialog } from "./upload-model-version-dialog";

export type RegisterModelDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelName: string;
  setModelName: (name: string) => void;
  modelError: string;
  setModelError: (error: string) => void;
  registering: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function RegisterModelDialog({
  open,
  onOpenChange,
  modelName,
  setModelName,
  modelError,
  setModelError,
  registering,
  onSubmit,
}: RegisterModelDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setModelName("");
          setModelError("");
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar modelo</DialogTitle>
          <DialogDescription className="sr-only">
            Registra un nuevo modelo TensorFlow Lite para esta aplicación.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="model-name" className="font-semibold text-sm">
              Nombre del modelo
            </label>
            <Input
              id="model-name"
              autoFocus
              required
              aria-required="true"
              value={modelName}
              onChange={(event) => {
                setModelName(event.target.value);
                if (modelError) setModelError("");
              }}
            />
            {modelError && (
              <p className="text-destructive text-sm" role="alert">
                {modelError}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="model-runtime" className="font-semibold text-sm">
              Runtime
            </label>
            <Input id="model-runtime" value="TensorFlow Lite" disabled readOnly />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={registering}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" data-testid="register-model-submit" disabled={registering}>
              {registering ? "Registrando modelo…" : "Registrar modelo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type ModelItem = {
  id: string;
  applicationId: string;
  name: string;
  runtime: "tensorflow_lite";
  versionCount: number;
  createdAt: string;
  updatedAt: string;
};

const MODELS_LOAD_ERROR = "No pudimos cargar los modelos. Inténtalo nuevamente.";
const MODELS_EMPTY_MESSAGE = "Aún no hay modelos registrados en esta aplicación.";

const RUNTIME_LABELS: Record<ModelItem["runtime"], string> = {
  tensorflow_lite: "TensorFlow Lite",
};

export type ModelsViewProps = {
  application: Application;
  canManage?: boolean;
};

export function ModelsView({ application, canManage = false }: ModelsViewProps) {
  const [registerModelDialogOpen, setRegisterModelDialogOpen] = useState(false);
  const [modelName, setModelName] = useState("");
  const [modelError, setModelError] = useState("");
  const [registeringModel, setRegisteringModel] = useState(false);

  const [models, setModels] = useState<ModelItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [modelToUpload, setModelToUpload] = useState<ModelItem | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadModels = useCallback(async (applicationId: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setModelsLoading(true);
    setModelsError("");
    try {
      const { data } = await httpClient.get<{ models?: ModelItem[] }>(
        `/applications/${applicationId}/models`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setModels(Array.isArray(data?.models) ? data.models : []);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setModelsError(errorMessage(loadError, MODELS_LOAD_ERROR));
    } finally {
      if (!controller.signal.aborted) {
        setModelsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadModels(application.id);
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [application.id, loadModels]);

  function openRegisterModel() {
    setModelName("");
    setModelError("");
    setRegisterModelDialogOpen(true);
  }

  async function handleRegisterModel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = modelName.trim();
    if (!trimmed) {
      setModelError("Ingresa un nombre para el modelo.");
      return;
    }

    setRegisteringModel(true);
    try {
      await httpClient.post(`/applications/${application.id}/models`, {
        name: trimmed,
        runtime: "tensorflow_lite",
      });
      toast.success("Modelo registrado.");
      setRegisterModelDialogOpen(false);
      setModelName("");
      setModelError("");
      void loadModels(application.id);
    } catch (err) {
      toast.error(errorMessage(err, "No pudimos registrar el modelo. Inténtalo nuevamente."));
    } finally {
      setRegisteringModel(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="application-section-heading flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconCpu className="size-5 text-primary" />
          <h2 className="font-semibold text-lg">Modelos</h2>
        </div>
        {canManage && application.status === "active" && (
          <Button
            size="sm"
            variant="outline"
            data-testid="register-model-trigger"
            onClick={openRegisterModel}
          >
            Registrar modelo
          </Button>
        )}
      </div>

      {modelsLoading ? (
        <p data-testid="models-loading" className="text-muted-foreground text-sm">
          Cargando modelos…
        </p>
      ) : modelsError ? (
        <div className="applications-error flex items-center gap-3" data-testid="models-error">
          <p className="text-destructive text-sm">{modelsError}</p>
          <Button
            variant="outline"
            size="sm"
            data-testid="models-retry"
            onClick={() => void loadModels(application.id)}
          >
            <IconRefresh className="mr-1 size-4" />
            Reintentar
          </Button>
        </div>
      ) : models.length === 0 ? (
        <p data-testid="models-empty" className="text-muted-foreground text-sm">
          {MODELS_EMPTY_MESSAGE}
        </p>
      ) : (
        <table className="models-table w-full text-sm" data-testid="models-table">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 font-medium">Nombre</th>
              <th className="pb-2 font-medium">ID</th>
              <th className="pb-2 font-medium">Runtime</th>
              <th className="pb-2 font-medium">Versiones</th>
              {canManage && application.status === "active" && (
                <th className="pb-2 font-medium">Acciones</th>
              )}
            </tr>
          </thead>
          <tbody>
            {models.map((modelItem) => (
              <tr key={modelItem.id} data-testid={`model-row-${modelItem.id}`}>
                <td className="py-2.5 font-medium">{modelItem.name}</td>
                <td className="py-2.5 text-muted-foreground">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {modelItem.id}
                  </code>
                </td>
                <td className="py-2.5 text-muted-foreground">
                  {RUNTIME_LABELS[modelItem.runtime] ?? modelItem.runtime}
                </td>
                <td className="py-2.5 text-muted-foreground">{modelItem.versionCount ?? 0}</td>
                {canManage && application.status === "active" && (
                  <td className="py-2.5">
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`upload-version-trigger-${modelItem.id}`}
                      onClick={() => setModelToUpload(modelItem)}
                    >
                      Subir versión
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <RegisterModelDialog
        open={registerModelDialogOpen}
        onOpenChange={setRegisterModelDialogOpen}
        modelName={modelName}
        setModelName={setModelName}
        modelError={modelError}
        setModelError={setModelError}
        registering={registeringModel}
        onSubmit={handleRegisterModel}
      />

      {modelToUpload && (
        <UploadModelVersionDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setModelToUpload(null);
          }}
          applicationId={application.id}
          modelId={modelToUpload.id}
          modelName={modelToUpload.name}
          onUploaded={() => {
            void loadModels(application.id);
          }}
        />
      )}
    </section>
  );
}
