"use client";

import {
  TELEMETRY_RETENTION_DAYS,
  type TelemetryPolicySettings,
  type TelemetryRetentionDays,
} from "@ayni/api/telemetry-policy";
import { IconInfoCircle, IconRefresh, IconShieldLock } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-error";
import { httpClient } from "@/lib/http-client";
import type { Application } from "../../types";

const LOAD_ERROR = "No pudimos cargar la política de telemetría. Inténtalo nuevamente.";
const SAVE_ERROR = "No pudimos guardar la política de telemetría. Inténtalo nuevamente.";

const selectClassName =
  "h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type TelemetryPolicyResponse = { policy: TelemetryPolicySettings };

export type TelemetryPolicyViewProps = {
  application: Application;
  canManage?: boolean;
};

/** Application → `Privacidad y telemetría` (US-100). */
export function TelemetryPolicyView({ application, canManage = false }: TelemetryPolicyViewProps) {
  const [saved, setSaved] = useState<TelemetryPolicySettings | null>(null);
  const [form, setForm] = useState<TelemetryPolicySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const editable = canManage && application.status === "active";
  const dirty =
    !!saved &&
    !!form &&
    (saved.enabled !== form.enabled || saved.retentionDays !== form.retentionDays);

  const loadPolicy = useCallback(async (applicationId: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setLoadError("");
    try {
      const { data } = await httpClient.get<TelemetryPolicyResponse>(
        `/applications/${applicationId}/telemetry-policy`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const policy = { enabled: data.policy.enabled, retentionDays: data.policy.retentionDays };
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
      const { data } = await httpClient.patch<TelemetryPolicyResponse>(
        `/applications/${application.id}/telemetry-policy`,
        { enabled: form.enabled, retentionDays: form.retentionDays },
      );
      const policy = { enabled: data.policy.enabled, retentionDays: data.policy.retentionDays };
      setSaved(policy);
      setForm(policy);
      toast.success("Política de telemetría actualizada.");
    } catch (error) {
      toast.error(errorMessage(error, SAVE_ERROR));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <IconShieldLock className="size-5 text-primary" />
        <h2 className="font-semibold text-lg">Privacidad y telemetría</h2>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Cargando política de telemetría…</p>
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
          <label className="flex items-center justify-between gap-4">
            <span className="font-medium text-sm">Permitir telemetría técnica</span>
            <input
              type="checkbox"
              role="switch"
              className="size-4 accent-primary disabled:cursor-not-allowed"
              checked={form.enabled}
              aria-checked={form.enabled}
              disabled={!editable || saving}
              onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
            />
          </label>

          <div className="space-y-1">
            <label htmlFor="telemetry-retention" className="block font-medium text-sm">
              Retención
            </label>
            <select
              id="telemetry-retention"
              className={selectClassName}
              value={form.retentionDays}
              disabled={!editable || saving}
              onChange={(event) =>
                setForm({
                  ...form,
                  retentionDays: Number(event.target.value) as TelemetryRetentionDays,
                })
              }
            >
              {TELEMETRY_RETENTION_DAYS.map((days) => (
                <option key={days} value={days}>
                  {days} días
                </option>
              ))}
            </select>
          </div>

          <p className="flex items-center gap-2 rounded-md bg-muted/40 p-3 text-muted-foreground text-sm">
            <IconInfoCircle className="size-4 shrink-0" />
            La telemetría no incluye imágenes ni entradas crudas.
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
                ? "La aplicación está archivada: su política de telemetría no se puede cambiar."
                : "Solo los administradores pueden cambiar la política de telemetría."}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
