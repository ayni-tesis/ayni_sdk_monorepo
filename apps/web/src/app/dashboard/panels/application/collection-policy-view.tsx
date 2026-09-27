"use client";

import {
  COLLECTION_IMAGE_QUALITY,
  COLLECTION_MAX_IMAGE_SIZE,
  COLLECTION_NETWORK_LABELS,
  COLLECTION_NETWORKS,
  type CollectionNetwork,
  type CollectionPolicySettings,
} from "@ayni/api/collection-policy";
import { IconInfoCircle, IconPhotoShield, IconRefresh } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api-error";
import { httpClient } from "@/lib/http-client";
import type { Application } from "../../types";

const LOAD_ERROR = "No pudimos cargar la política de recolección. Inténtalo nuevamente.";
const SAVE_ERROR = "No pudimos guardar la política de recolección. Inténtalo nuevamente.";

const selectClassName =
  "h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type CollectionPolicyResponse = { policy: CollectionPolicySettings };

// The number fields stay as typed text so an administrator can clear and retype them.
type CollectionPolicyForm = Omit<CollectionPolicySettings, "maxImageSize" | "imageQuality"> & {
  maxImageSize: string;
  imageQuality: string;
};

function toForm(policy: CollectionPolicySettings): CollectionPolicyForm {
  return {
    enabled: policy.enabled,
    consentRequired: policy.consentRequired,
    network: policy.network,
    maxImageSize: String(policy.maxImageSize),
    imageQuality: String(policy.imageQuality),
  };
}

/** An emptied field is sent as null so the server names the field that is missing. */
function toNumber(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

export type CollectionPolicyViewProps = {
  application: Application;
  canManage?: boolean;
};

/** Application → `Privacidad y recolección` (US-063). */
export function CollectionPolicyView({
  application,
  canManage = false,
}: CollectionPolicyViewProps) {
  const [saved, setSaved] = useState<CollectionPolicyForm | null>(null);
  const [form, setForm] = useState<CollectionPolicyForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const editable = canManage && application.status === "active";
  const disabled = !editable || saving;
  const dirty =
    !!saved &&
    !!form &&
    (saved.enabled !== form.enabled ||
      saved.consentRequired !== form.consentRequired ||
      saved.network !== form.network ||
      saved.maxImageSize !== form.maxImageSize ||
      saved.imageQuality !== form.imageQuality);

  const loadPolicy = useCallback(async (applicationId: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setLoadError("");
    try {
      const { data } = await httpClient.get<CollectionPolicyResponse>(
        `/applications/${applicationId}/collection-policy`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const policy = toForm(data.policy);
      setSaved(policy);
      setForm(policy);
    } catch (error) {
      if (controller.signal.aborted) return;
      setLoadError(errorMessage(error, LOAD_ERROR));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPolicy(application.id);
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [application.id, loadPolicy]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || !dirty) return;

    setSaving(true);
    try {
      const { data } = await httpClient.patch<CollectionPolicyResponse>(
        `/applications/${application.id}/collection-policy`,
        {
          enabled: form.enabled,
          consentRequired: form.consentRequired,
          network: form.network,
          maxImageSize: toNumber(form.maxImageSize),
          imageQuality: toNumber(form.imageQuality),
        },
      );
      const policy = toForm(data.policy);
      setSaved(policy);
      setForm(policy);
      toast.success("Política de recolección actualizada.");
    } catch (error) {
      toast.error(errorMessage(error, SAVE_ERROR));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <IconPhotoShield className="size-5 text-primary" />
        <h2 className="font-semibold text-lg">Privacidad y recolección</h2>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Cargando política de recolección…</p>
      ) : loadError || !form ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-destructive text-sm">{loadError || LOAD_ERROR}</p>
          <Button variant="outline" size="sm" onClick={() => void loadPolicy(application.id)}>
            <IconRefresh className="mr-1.5 size-4" />
            Reintentar
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-xl space-y-5 rounded-lg border p-4">
          <h3 className="font-medium">Recolección de evidencia</h3>

          <label className="flex items-center justify-between gap-4">
            <span className="font-medium text-sm">Permitir captura de imágenes para datasets</span>
            <input
              type="checkbox"
              role="switch"
              className="size-4 accent-primary disabled:cursor-not-allowed"
              checked={form.enabled}
              aria-checked={form.enabled}
              disabled={disabled}
              onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
            />
          </label>

          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">Exigir el consentimiento del usuario antes de capturar</span>
            <input
              type="checkbox"
              className="size-4 accent-primary disabled:cursor-not-allowed"
              checked={form.consentRequired}
              disabled={disabled}
              onChange={(event) => setForm({ ...form, consentRequired: event.target.checked })}
            />
          </label>

          <div className="space-y-1">
            <label htmlFor="collection-network" className="block font-medium text-sm">
              Red permitida
            </label>
            <select
              id="collection-network"
              className={selectClassName}
              value={form.network}
              disabled={disabled}
              onChange={(event) =>
                setForm({ ...form, network: event.target.value as CollectionNetwork })
              }
            >
              {COLLECTION_NETWORKS.map((network) => (
                <option key={network} value={network}>
                  {COLLECTION_NETWORK_LABELS[network]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="collection-max-size" className="block font-medium text-sm">
              Tamaño máximo
            </label>
            <Input
              id="collection-max-size"
              type="number"
              inputMode="numeric"
              className="max-w-xs"
              min={COLLECTION_MAX_IMAGE_SIZE.min}
              max={COLLECTION_MAX_IMAGE_SIZE.max}
              step={1}
              value={form.maxImageSize}
              disabled={disabled}
              aria-describedby="collection-max-size-help"
              onChange={(event) => setForm({ ...form, maxImageSize: event.target.value })}
            />
            <p id="collection-max-size-help" className="text-muted-foreground text-xs">
              Lado mayor de la imagen, entre {COLLECTION_MAX_IMAGE_SIZE.min} y{" "}
              {COLLECTION_MAX_IMAGE_SIZE.max} píxeles.
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="collection-quality" className="block font-medium text-sm">
              Calidad
            </label>
            <Input
              id="collection-quality"
              type="number"
              inputMode="numeric"
              className="max-w-xs"
              min={COLLECTION_IMAGE_QUALITY.min}
              max={COLLECTION_IMAGE_QUALITY.max}
              step={1}
              value={form.imageQuality}
              disabled={disabled}
              aria-describedby="collection-quality-help"
              onChange={(event) => setForm({ ...form, imageQuality: event.target.value })}
            />
            <p id="collection-quality-help" className="text-muted-foreground text-xs">
              Compresión de la imagen, entre {COLLECTION_IMAGE_QUALITY.min} y{" "}
              {COLLECTION_IMAGE_QUALITY.max}.
            </p>
          </div>

          <p className="flex items-center gap-2 rounded-md bg-muted/40 p-3 text-muted-foreground text-sm">
            <IconInfoCircle className="size-4 shrink-0" />
            Las imágenes se subirán solo desde workflows que incluyan dataset.capture y con
            consentimiento.
          </p>

          {editable ? (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={!dirty || saving}
                onClick={() => setForm(saved)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!dirty || saving}>
                {saving ? "Guardando política…" : "Guardar política"}
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              {application.status !== "active"
                ? "La aplicación está archivada: su política de recolección no se puede cambiar."
                : "Solo los administradores pueden cambiar la política de recolección."}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
