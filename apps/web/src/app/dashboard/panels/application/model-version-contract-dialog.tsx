"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api-error";
import { httpClient } from "@/lib/http-client";

export type ModelVersionContract = {
  input: {
    type: "image";
    width: number;
    height: number;
    channels: 1 | 3 | 4;
    normalization: "none" | "zero_to_one" | "minus_one_to_one";
  };
  output:
    | { type: "classification"; labels: string[] }
    | { type: "detection"; labels: string[]; scoreThreshold: number };
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  modelId: string;
  modelVersionId: string;
  version: string;
  contract: ModelVersionContract | null;
  onSaved: (contract: ModelVersionContract) => void;
};

export function ModelVersionContractDialog({
  open,
  onOpenChange,
  applicationId,
  modelId,
  modelVersionId,
  version,
  contract,
  onSaved,
}: Props) {
  const [task, setTask] = useState<"classification" | "detection">("classification");
  const [width, setWidth] = useState("224");
  const [height, setHeight] = useState("224");
  const [channels, setChannels] = useState("3");
  const [normalization, setNormalization] =
    useState<ModelVersionContract["input"]["normalization"]>("zero_to_one");
  const [labels, setLabels] = useState("");
  const [scoreThreshold, setScoreThreshold] = useState("0.5");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setWidth(String(contract?.input.width ?? 224));
    setHeight(String(contract?.input.height ?? 224));
    setChannels(String(contract?.input.channels ?? 3));
    setNormalization(contract?.input.normalization ?? "zero_to_one");
    setTask(contract?.output.type ?? "classification");
    setLabels(contract?.output.labels.join("\n") ?? "");
    setScoreThreshold(
      String(contract?.output.type === "detection" ? contract.output.scoreThreshold : 0.5),
    );
    setError("");
  }, [contract, open]);

  async function save() {
    const parsedLabels = labels
      .split(/\r?\n/)
      .map((label) => label.trim())
      .filter(Boolean);
    const input = {
      type: "image" as const,
      width: Number(width),
      height: Number(height),
      channels: Number(channels) as 1 | 3 | 4,
      normalization,
    };
    const output: ModelVersionContract["output"] =
      task === "classification"
        ? { type: task, labels: parsedLabels }
        : { type: task, labels: parsedLabels, scoreThreshold: Number(scoreThreshold) };
    const nextContract = { input, output };

    setSaving(true);
    setError("");
    try {
      await httpClient.patch(
        `/applications/${applicationId}/models/${modelId}/versions/${modelVersionId}/contract`,
        nextContract,
      );
      onSaved(nextContract);
      onOpenChange(false);
    } catch (saveError) {
      setError(errorMessage(saveError, "No se pudo guardar el contrato."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contrato de la versión {version}</DialogTitle>
          <DialogDescription>
            Contrato de entradas y salidas para TensorFlow Lite.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <label className="grid gap-1 text-sm">
            Tipo de tarea
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={task}
              onChange={(event) => setTask(event.target.value as typeof task)}
            >
              <option value="classification">Clasificación</option>
              <option value="detection">Detección</option>
            </select>
          </label>
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-2 font-medium text-sm">Entrada de imagen</legend>
            <label className="grid gap-1 text-sm">
              Ancho
              <input
                className="h-9 rounded-md border bg-background px-3"
                type="number"
                min="1"
                max="8192"
                required
                value={width}
                onChange={(event) => setWidth(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Alto
              <input
                className="h-9 rounded-md border bg-background px-3"
                type="number"
                min="1"
                max="8192"
                required
                value={height}
                onChange={(event) => setHeight(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Canales
              <select
                className="h-9 rounded-md border bg-background px-3"
                value={channels}
                onChange={(event) => setChannels(event.target.value)}
              >
                <option value="1">1</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Normalización
              <select
                className="h-9 rounded-md border bg-background px-3"
                value={normalization}
                onChange={(event) => setNormalization(event.target.value as typeof normalization)}
              >
                <option value="none">Sin normalización</option>
                <option value="zero_to_one">0 a 1</option>
                <option value="minus_one_to_one">-1 a 1</option>
              </select>
            </label>
          </fieldset>
          <label className="grid gap-1 text-sm">
            Etiquetas, una por línea
            <textarea
              className="min-h-20 rounded-md border bg-background px-3 py-2"
              required
              value={labels}
              onChange={(event) => setLabels(event.target.value)}
            />
          </label>
          {task === "detection" && (
            <label className="grid gap-1 text-sm">
              Umbral de confianza
              <input
                className="h-9 rounded-md border bg-background px-3"
                type="number"
                min="0"
                max="1"
                step="0.01"
                required
                value={scoreThreshold}
                onChange={(event) => setScoreThreshold(event.target.value)}
              />
            </label>
          )}
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Guardando…" : "Guardar contrato"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
