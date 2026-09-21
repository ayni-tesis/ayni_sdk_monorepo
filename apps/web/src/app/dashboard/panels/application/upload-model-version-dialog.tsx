"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  MODEL_VERSION_UPLOAD_CANCELED,
  MODEL_VERSION_UPLOAD_FALLBACK_MESSAGE,
  type ModelVersionDto,
  uploadModelVersion,
} from "./upload-model-version";

const SEMVER_STRICT = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const MIN_TFLITE_BYTES = 12;

const INVALID_VERSION_MESSAGE = "Ingresa una versión con formato SemVer, por ejemplo 1.0.0.";
const INVALID_FILE_MESSAGE = "El archivo no es un modelo TensorFlow Lite válido.";
const MISSING_FILE_MESSAGE = "Selecciona un archivo .tflite.";
const DUPLICATE_VERSION_MESSAGE = "Ya existe una versión con este identificador.";

export type UploadModelVersionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  modelId: string;
  modelName: string;
  onUploaded?: (modelVersion: ModelVersionDto) => void;
};

export function UploadModelVersionDialog({
  open,
  onOpenChange,
  applicationId,
  modelId,
  modelName,
  onUploaded,
}: UploadModelVersionDialogProps) {
  const [version, setVersion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function resetForm() {
    setVersion("");
    setFile(null);
    setError("");
    setProgress(null);
  }

  function cancelUpload() {
    abortRef.current?.abort();
    abortRef.current = null;
    setUploading(false);
    setProgress(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (uploading) cancelUpload();
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploading) return;

    const trimmed = version.trim();
    if (!SEMVER_STRICT.test(trimmed)) {
      setError(INVALID_VERSION_MESSAGE);
      return;
    }
    if (!file) {
      setError(MISSING_FILE_MESSAGE);
      return;
    }
    if (file.size < MIN_TFLITE_BYTES) {
      setError(INVALID_FILE_MESSAGE);
      return;
    }

    setUploading(true);
    setError("");
    setProgress(0);

    const controller = new AbortController();
    abortRef.current = controller;

    const result = await uploadModelVersion({
      applicationId,
      modelId,
      version: trimmed,
      file,
      onProgress: setProgress,
      signal: controller.signal,
    });

    if (!result.ok && result.code === MODEL_VERSION_UPLOAD_CANCELED) {
      abortRef.current = null;
      setUploading(false);
      setProgress(null);
      return;
    }

    abortRef.current = null;

    if (result.ok) {
      toast.success(`Versión ${trimmed} subida y verificada.`);
      setUploading(false);
      resetForm();
      onUploaded?.(result.modelVersion);
      onOpenChange(false);
      return;
    }

    setUploading(false);
    setProgress(null);
    setError(
      result.code === "modelVersionExists"
        ? DUPLICATE_VERSION_MESSAGE
        : result.message || MODEL_VERSION_UPLOAD_FALLBACK_MESSAGE,
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subir versión de modelo</DialogTitle>
          <DialogDescription>Para {modelName}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="model-version" className="font-semibold text-sm">
              Versión
            </label>
            <Input
              id="model-version"
              autoFocus
              required
              aria-required="true"
              placeholder="1.0.0"
              value={version}
              disabled={uploading}
              onChange={(event) => {
                setVersion(event.target.value);
                if (error) setError("");
              }}
            />
            <p className="text-muted-foreground text-sm">
              No podrás reemplazar una versión publicada con el mismo identificador.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="model-file" className="font-semibold text-sm">
              Archivo TensorFlow Lite (.tflite)
            </label>
            <Input
              id="model-file"
              type="file"
              accept=".tflite,application/octet-stream"
              required
              aria-required="true"
              disabled={uploading}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                if (error) setError("");
              }}
            />
          </div>
          {uploading && progress !== null && (
            <div className="flex flex-col gap-1">
              <div
                role="progressbar"
                aria-label="Subiendo modelo"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-muted-foreground text-sm">Subiendo modelo… {progress}%</p>
            </div>
          )}
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (uploading) cancelUpload();
                else handleOpenChange(false);
              }}
            >
              {uploading ? "Cancelar subida" : "Cancelar"}
            </Button>
            <Button type="submit" data-testid="upload-version-submit" disabled={uploading}>
              {uploading ? "Subiendo…" : "Subir versión"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
