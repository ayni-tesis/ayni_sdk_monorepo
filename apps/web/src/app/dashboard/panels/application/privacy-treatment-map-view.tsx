"use client";

import {
  MAX_PRIVACY_TREATMENTS,
  missingPrivacyTreatmentFields,
  type PrivacyTreatment,
} from "@ayni/api/privacy-treatment";
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api-error";
import { httpClient } from "@/lib/http-client";
import type { Application } from "../../types";

const LOAD_ERROR = "No pudimos cargar el mapa de tratamientos.";
const SAVE_ERROR = "No pudimos guardar el mapa de tratamientos.";
const pendingFieldLabels: Record<string, string> = {
  purpose: "finalidad",
  dataCategories: "categorías de datos",
  dataContext: "titular de los datos",
  source: "fuente",
  requirement: "obligatoriedad",
  legalBasis: "base aplicable confirmada",
  role: "rol",
  recipients: "destinatarios",
  transfers: "transferencias",
  retention: "conservación",
  rightsChannel: "canal de derechos",
};
const fieldClassName =
  "min-h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm";
const selectClassName =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-hidden focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type PrivacyTreatmentMap = {
  applicationId: string;
  treatments: PrivacyTreatment[];
  readyToPublish: boolean;
  latestPublishedVersion: number;
  updatedAt: string | null;
};

type MapResponse = { map: PrivacyTreatmentMap };
type PublishResponse = { version: { version: number; publishedAt: string } };
type PublishError = { message?: string; pendingTreatments?: Array<{ id: string }> };

function emptyTreatment(): PrivacyTreatment {
  return {
    id: crypto.randomUUID(),
    purpose: "",
    dataCategories: [],
    dataContext: "undetermined",
    source: "",
    requirement: "undetermined",
    legalBasis: "",
    legalBasisConfirmed: false,
    role: "undetermined",
    recipients: [],
    transfers: "",
    retention: "",
    rightsChannel: "",
  };
}

function lines(values: string[]): string {
  return values.join("\n");
}

function fromLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export type PrivacyTreatmentMapViewProps = {
  application: Application;
  canManage?: boolean;
};

/** Application → `Privacidad y datos` → `Mapa de tratamientos` (US-151). */
export function PrivacyTreatmentMapView({
  application,
  canManage = false,
}: PrivacyTreatmentMapViewProps) {
  const [saved, setSaved] = useState<PrivacyTreatmentMap | null>(null);
  const [treatments, setTreatments] = useState<PrivacyTreatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const editable = canManage && application.status === "active";
  const dirty = !!saved && JSON.stringify(saved.treatments) !== JSON.stringify(treatments);

  // ponytail: keep this loader local until the shared policy-view request hook is extracted.
  const loadMap = useCallback(async (applicationId: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    setLoadError("");
    try {
      const { data } = await httpClient.get<MapResponse>(
        `/applications/${applicationId}/privacy-treatment-map`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setSaved(data.map);
      setTreatments(data.map.treatments);
    } catch (error) {
      if (controller.signal.aborted) return;
      setLoadError(errorMessage(error, LOAD_ERROR));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMap(application.id);
    return () => abortControllerRef.current?.abort();
  }, [application.id, loadMap]);

  function updateTreatment(id: string, update: Partial<PrivacyTreatment>) {
    setTreatments((current) =>
      current.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || !editable || saving) return;

    setSaving(true);
    try {
      const { data } = await httpClient.put<MapResponse>(
        `/applications/${application.id}/privacy-treatment-map`,
        { treatments },
      );
      setSaved(data.map);
      setTreatments(data.map.treatments);
      toast.success("Mapa de tratamientos guardado.");
    } catch (error) {
      toast.error(errorMessage(error, SAVE_ERROR));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!editable || dirty || publishing || !treatments.length) return;
    setPublishing(true);
    setPublishError("");
    try {
      const { data } = await httpClient.post<PublishResponse>(
        `/applications/${application.id}/privacy-notice/publish`,
      );
      setSaved((current) =>
        current ? { ...current, latestPublishedVersion: data.version.version } : current,
      );
      toast.success(`Aviso de privacidad versión ${data.version.version} publicado.`);
    } catch (error) {
      const details = axios.isAxiosError<PublishError>(error) ? error.response?.data : undefined;
      const pending = details?.pendingTreatments?.flatMap(({ id }) => {
        const treatment = treatments.find((item) => item.id === id);
        return treatment ? [treatment.purpose || "Finalidad sin nombre"] : [];
      });
      setPublishError(
        pending?.length
          ? `${details?.message ?? "No pudimos publicar el aviso."} Pendiente: ${pending.join(", ")}.`
          : (details?.message ?? "No pudimos publicar el aviso de privacidad."),
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section aria-labelledby="privacy-treatment-map-heading" className="space-y-5">
      <div>
        <h2 id="privacy-treatment-map-heading" className="font-semibold text-lg">
          Mapa de tratamientos
        </h2>
        <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
          Registra los datos y finalidades de esta aplicación. Confirma estos datos con la persona
          responsable de privacidad antes de publicar el aviso.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Cargando mapa de tratamientos…</p>
      ) : loadError ? (
        <div role="alert" className="space-y-3">
          <p className="text-destructive text-sm">{loadError}</p>
          <Button type="button" variant="outline" onClick={() => void loadMap(application.id)}>
            Reintentar
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-4xl space-y-5">
          <p role="status" className="text-sm">
            {saved?.readyToPublish
              ? "El mapa está completo para publicar un aviso de privacidad."
              : "El mapa está pendiente de completar; no se puede publicar un aviso con tratamientos sin confirmar."}
          </p>
          <p className="text-muted-foreground text-sm">
            Publicar guarda una versión inmutable del mapa. Esto no constituye una validación legal.
            {saved?.latestPublishedVersion
              ? ` Versión publicada: ${saved.latestPublishedVersion}.`
              : " Aún no hay una versión publicada."}
          </p>
          {publishError && (
            <p role="alert" className="text-destructive text-sm">
              {publishError}
            </p>
          )}

          {treatments.length === 0 ? (
            <p className="rounded-md border p-4 text-muted-foreground text-sm">
              Aún no se han registrado tratamientos.
            </p>
          ) : (
            <div className="space-y-5">
              {treatments.map((treatment, index) => {
                const prefix = `privacy-treatment-${treatment.id}`;
                const missingFields = missingPrivacyTreatmentFields(treatment);
                return (
                  <fieldset key={treatment.id} className="space-y-4 rounded-lg border p-4">
                    <legend className="px-1 font-medium text-sm">
                      Finalidad {index + 1}: {treatment.purpose || "Sin nombre"}
                    </legend>
                    {missingFields.length > 0 && (
                      <p className="text-muted-foreground text-sm">
                        Pendiente:{" "}
                        {missingFields.map((field) => pendingFieldLabels[field]).join(", ")}.
                      </p>
                    )}

                    <label className="block space-y-1 text-sm" htmlFor={`${prefix}-purpose`}>
                      <span>Finalidad</span>
                      <Input
                        id={`${prefix}-purpose`}
                        value={treatment.purpose}
                        disabled={!editable || saving}
                        onChange={(event) =>
                          updateTreatment(treatment.id, { purpose: event.target.value })
                        }
                      />
                    </label>

                    <label className="block space-y-1 text-sm" htmlFor={`${prefix}-categories`}>
                      <span>Categorías de datos (una por línea)</span>
                      <textarea
                        id={`${prefix}-categories`}
                        className={fieldClassName}
                        rows={2}
                        value={lines(treatment.dataCategories)}
                        disabled={!editable || saving}
                        onChange={(event) =>
                          updateTreatment(treatment.id, {
                            dataCategories: fromLines(event.target.value),
                          })
                        }
                      />
                    </label>

                    <label className="block space-y-1 text-sm" htmlFor={`${prefix}-context`}>
                      <span>¿De quién son los datos?</span>
                      <select
                        id={`${prefix}-context`}
                        className={selectClassName}
                        value={treatment.dataContext}
                        disabled={!editable || saving}
                        onChange={(event) =>
                          updateTreatment(treatment.id, {
                            dataContext: event.target.value as PrivacyTreatment["dataContext"],
                          })
                        }
                      >
                        <option value="undetermined">Por determinar</option>
                        <option value="ayniPlatform">
                          Datos que Ayni trata para operar la plataforma
                        </option>
                        <option value="clientApplication">
                          Datos de usuarios de la aplicación cliente
                        </option>
                      </select>
                    </label>

                    <label className="block space-y-1 text-sm" htmlFor={`${prefix}-source`}>
                      <span>Fuente de los datos</span>
                      <Input
                        id={`${prefix}-source`}
                        value={treatment.source}
                        placeholder="Por ejemplo: persona usuaria, dispositivo"
                        disabled={!editable || saving}
                        onChange={(event) =>
                          updateTreatment(treatment.id, { source: event.target.value })
                        }
                      />
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-1 text-sm" htmlFor={`${prefix}-requirement`}>
                        <span>¿El dato es obligatorio?</span>
                        <select
                          id={`${prefix}-requirement`}
                          className={selectClassName}
                          value={treatment.requirement}
                          disabled={!editable || saving}
                          onChange={(event) =>
                            updateTreatment(treatment.id, {
                              requirement: event.target.value as PrivacyTreatment["requirement"],
                            })
                          }
                        >
                          <option value="undetermined">Por determinar</option>
                          <option value="required">Obligatorio</option>
                          <option value="optional">Opcional</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-sm" htmlFor={`${prefix}-role`}>
                        <span>Rol de Ayni o de la aplicación</span>
                        <select
                          id={`${prefix}-role`}
                          className={selectClassName}
                          value={treatment.role}
                          disabled={!editable || saving}
                          onChange={(event) =>
                            updateTreatment(treatment.id, {
                              role: event.target.value as PrivacyTreatment["role"],
                            })
                          }
                        >
                          <option value="undetermined">Por determinar</option>
                          <option value="controller">Responsable</option>
                          <option value="processor">Encargado</option>
                        </select>
                      </label>
                    </div>

                    <label className="block space-y-1 text-sm" htmlFor={`${prefix}-basis`}>
                      <span>Base aplicable (déjala vacía si está por determinar)</span>
                      <Input
                        id={`${prefix}-basis`}
                        value={treatment.legalBasis}
                        placeholder="Describe la base revisada para esta finalidad"
                        disabled={!editable || saving}
                        onChange={(event) =>
                          updateTreatment(treatment.id, { legalBasis: event.target.value })
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary disabled:cursor-not-allowed"
                        checked={treatment.legalBasisConfirmed}
                        disabled={!editable || saving}
                        onChange={(event) =>
                          updateTreatment(treatment.id, {
                            legalBasisConfirmed: event.target.checked,
                          })
                        }
                      />
                      Base revisada y confirmada
                    </label>

                    <label className="block space-y-1 text-sm" htmlFor={`${prefix}-recipients`}>
                      <span>
                        Destinatarios o encargados (uno por línea; escribe “Ninguno” si no aplica)
                      </span>
                      <textarea
                        id={`${prefix}-recipients`}
                        className={fieldClassName}
                        rows={2}
                        value={lines(treatment.recipients)}
                        disabled={!editable || saving}
                        onChange={(event) =>
                          updateTreatment(treatment.id, {
                            recipients: fromLines(event.target.value),
                          })
                        }
                      />
                    </label>

                    <label className="block space-y-1 text-sm" htmlFor={`${prefix}-transfers`}>
                      <span>Transferencias nacionales o internacionales</span>
                      <Input
                        id={`${prefix}-transfers`}
                        value={treatment.transfers}
                        placeholder="Describe las transferencias o indica si no aplican"
                        disabled={!editable || saving}
                        onChange={(event) =>
                          updateTreatment(treatment.id, { transfers: event.target.value })
                        }
                      />
                    </label>

                    <label className="block space-y-1 text-sm" htmlFor={`${prefix}-retention`}>
                      <span>Periodo de conservación</span>
                      <Input
                        id={`${prefix}-retention`}
                        value={treatment.retention}
                        placeholder="Describe el periodo o criterio de conservación"
                        disabled={!editable || saving}
                        onChange={(event) =>
                          updateTreatment(treatment.id, { retention: event.target.value })
                        }
                      />
                    </label>

                    <label className="block space-y-1 text-sm" htmlFor={`${prefix}-rights`}>
                      <span>Canal para ejercer derechos</span>
                      <Input
                        id={`${prefix}-rights`}
                        value={treatment.rightsChannel}
                        placeholder="Correo o ruta de solicitud"
                        disabled={!editable || saving}
                        onChange={(event) =>
                          updateTreatment(treatment.id, { rightsChannel: event.target.value })
                        }
                      />
                    </label>

                    <Button
                      type="button"
                      variant="outline"
                      disabled={!editable || saving}
                      aria-label={`Eliminar finalidad ${treatment.purpose || index + 1}`}
                      onClick={() =>
                        setTreatments((current) => current.filter(({ id }) => id !== treatment.id))
                      }
                    >
                      Eliminar tratamiento
                    </Button>
                  </fieldset>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!editable || saving || treatments.length >= MAX_PRIVACY_TREATMENTS}
              onClick={() => setTreatments((current) => [...current, emptyTreatment()])}
            >
              Agregar tratamiento
            </Button>
            <Button type="submit" disabled={!editable || !dirty || saving}>
              {saving ? "Guardando mapa…" : "Guardar mapa de tratamientos"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!editable || dirty || publishing || !treatments.length}
              onClick={() => void handlePublish()}
            >
              {publishing ? "Publicando aviso…" : "Publicar aviso de privacidad"}
            </Button>
          </div>
          {treatments.length >= MAX_PRIVACY_TREATMENTS && (
            <p className="text-muted-foreground text-sm">
              Puedes registrar hasta {MAX_PRIVACY_TREATMENTS} tratamientos por aplicación.
            </p>
          )}

          {!editable && (
            <p className="text-muted-foreground text-sm">
              Solo administradores y propietarios pueden editar el mapa de una aplicación activa.
            </p>
          )}
        </form>
      )}
    </section>
  );
}
