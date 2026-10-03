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
const RETENTION_SAVE_ERROR = "No pudimos guardar la retención. Inténtalo nuevamente.";

const selectClassName =
  "h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type TelemetryPolicyResponse = { policy: TelemetryPolicySettings };

type Section = "policy" | "retention";

export type TelemetryPolicyViewProps = {
  application: Application;
  canManage?: boolean;
};

/**
 * Application → `Privacidad y telemetría`: the telemetry switch (US-100) and,
 * saved on its own, the retention period (US-112).
 */
export function TelemetryPolicyView({ application, canManage = false }: TelemetryPolicyViewProps) {
  const [saved, setSaved] = useState<TelemetryPolicySettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [retentionDays, setRetentionDays] = useState<TelemetryRetentionDays>(30);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState<Section | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const editable = canManage && application.status === "active";
  const policyDirty = !!saved && saved.enabled !== enabled;
  const retentionDirty = !!saved && saved.retentionDays !== retentionDays;

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
      setSaved({ enabled: data.policy.enabled, retentionDays: data.policy.retentionDays });
      setEnabled(data.policy.enabled);
      setRetentionDays(data.policy.retentionDays);
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

  // Each form sends only its own field, so saving one never overwrites the
  // other; an unsaved change in the other form is kept.
  async function save(section: Section, change: Partial<TelemetryPolicySettings>) {
    setSaving(section);
    try {
      const { data } = await httpClient.patch<TelemetryPolicyResponse>(
        `/applications/${application.id}/telemetry-policy`,
        change,
      );
      if (section === "policy" || !policyDirty) setEnabled(data.policy.enabled);
      if (section === "retention" || !retentionDirty) setRetentionDays(data.policy.retentionDays);
      setSaved({ enabled: data.policy.enabled, retentionDays: data.policy.retentionDays });
      toast.success(
        section === "policy" ? "Política de telemetría actualizada." : "Retención actualizada.",
      );
    } catch (error) {
      toast.error(errorMessage(error, section === "policy" ? SAVE_ERROR : RETENTION_SAVE_ERROR));
    } finally {
      setSaving(null);
    }
  }

  function handlePolicySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (policyDirty) void save("policy", { enabled });
  }

  function handleRetentionSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (retentionDirty) void save("retention", { retentionDays });
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <IconShieldLock className="size-5 text-primary" />
        <h2 className="font-semibold text-lg">Privacidad y telemetría</h2>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Cargando política de telemetría…</p>
      ) : loadError || !saved ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-destructive text-sm">{loadError || LOAD_ERROR}</p>
          <Button variant="outline" size="sm" onClick={() => void loadPolicy(application.id)}>
            <IconRefresh className="mr-1.5 size-4" />
            Reintentar
          </Button>
        </div>
      ) : (
        <>
          <form
            aria-label="Política de telemetría"
            onSubmit={handlePolicySubmit}
            className="max-w-xl space-y-5 rounded-lg border p-4"
          >
            <label className="flex items-center justify-between gap-4">
              <span className="font-medium text-sm">Permitir telemetría técnica</span>
              <input
                type="checkbox"
                role="switch"
                className="size-4 accent-primary disabled:cursor-not-allowed"
                checked={enabled}
                aria-checked={enabled}
                disabled={!editable || saving !== null}
                onChange={(event) => setEnabled(event.target.checked)}
              />
            </label>

            <p className="flex items-center gap-2 rounded-md bg-muted/40 p-3 text-muted-foreground text-sm">
              <IconInfoCircle className="size-4 shrink-0" />
              La telemetría no incluye imágenes ni entradas crudas.
            </p>

            {editable && (
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!policyDirty || saving !== null}
                  onClick={() => setEnabled(saved.enabled)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={!policyDirty || saving !== null}>
                  {saving === "policy" ? "Guardando política…" : "Guardar política"}
                </Button>
              </div>
            )}
          </form>

          <form
            aria-labelledby="telemetry-retention-heading"
            onSubmit={handleRetentionSubmit}
            className="max-w-xl space-y-4 rounded-lg border p-4"
          >
            <h3 id="telemetry-retention-heading" className="font-semibold text-base">
              Retención
            </h3>

            <div className="space-y-1">
              <label htmlFor="telemetry-retention" className="block font-medium text-sm">
                Periodo de retención
              </label>
              <select
                id="telemetry-retention"
                className={selectClassName}
                value={retentionDays}
                aria-describedby="telemetry-retention-help"
                disabled={!editable || saving !== null}
                onChange={(event) =>
                  setRetentionDays(Number(event.target.value) as TelemetryRetentionDays)
                }
              >
                {TELEMETRY_RETENTION_DAYS.map((days) => (
                  <option key={days} value={days}>
                    {days} días
                  </option>
                ))}
              </select>
              <p id="telemetry-retention-help" className="text-muted-foreground text-xs">
                Las trazas vencidas dejarán de estar disponibles.
              </p>
            </div>

            {editable && (
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!retentionDirty || saving !== null}
                  onClick={() => setRetentionDays(saved.retentionDays)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={!retentionDirty || saving !== null}>
                  {saving === "retention" ? "Guardando retención…" : "Guardar retención"}
                </Button>
              </div>
            )}
          </form>

          {!editable && (
            <p className="max-w-xl text-muted-foreground text-xs">
              {application.status !== "active"
                ? "La aplicación está archivada: su política de telemetría no se puede cambiar."
                : "Solo los administradores pueden cambiar la política de telemetría."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
