"use client";

import {
  PRIVACY_RIGHTS_REQUEST_STATUSES,
  type UpdatePrivacyRightsRequest,
} from "@ayni/api/privacy-rights-request";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { httpClient } from "@/lib/http-client";
import type { Application } from "../../types";

const statusLabels = {
  received: "Recibida",
  inReview: "En revisión",
  answered: "Respondida",
  notApplicable: "No procede",
} as const;
const typeLabels = {
  access: "Acceso",
  rectification: "Actualización o rectificación",
  cancellation: "Cancelación",
  opposition: "Oposición",
  portability: "Portabilidad",
} as const;

type Request = {
  id: string;
  noticeVersion: number;
  purpose: string;
  responsibleEntity: string;
  rightsChannel: string;
  type: keyof typeof typeLabels;
  contactEmail: string;
  details: string;
  status: keyof typeof statusLabels;
  response: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
  updatedById: string | null;
};

type Draft = Pick<UpdatePrivacyRightsRequest, "status" | "response" | "reason">;

export function PrivacyRightsRequestsView({
  application,
  canManage = false,
}: {
  application: Application;
  canManage?: boolean;
}) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const loadRequests = useCallback(
    async (applicationId: string, pageNumber: number, signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const { data } = await httpClient.get<{ requests: Request[]; hasMore: boolean }>(
          `/applications/${applicationId}/privacy-requests?page=${pageNumber}`,
          { signal },
        );
        if (signal?.aborted) return;
        setRequests(data.requests);
        setHasMore(data.hasMore);
        setDrafts(
          Object.fromEntries(
            data.requests.map((request) => [
              request.id,
              { status: request.status, response: request.response, reason: request.reason },
            ]),
          ),
        );
      } catch {
        if (!signal?.aborted) setError("No pudimos cargar las solicitudes de derechos.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    void loadRequests(application.id, page, controller.signal);
    return () => controller.abort();
  }, [application.id, canManage, loadRequests, page]);

  function updateDraft(id: string, update: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...update } }));
  }

  async function save(id: string) {
    const draft = drafts[id];
    if (!draft || savingId) return;
    setSavingId(id);
    setError("");
    try {
      const { data } = await httpClient.patch<{ request: Request }>(
        `/applications/${application.id}/privacy-requests/${encodeURIComponent(id)}`,
        draft,
      );
      setRequests((current) =>
        current.map((request) => (request.id === id ? data.request : request)),
      );
      setDrafts((current) => ({
        ...current,
        [id]: {
          status: data.request.status,
          response: data.request.response,
          reason: data.request.reason,
        },
      }));
    } catch {
      setError("No pudimos guardar la solicitud.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <section aria-labelledby="privacy-rights-requests-heading" className="space-y-4">
      <div>
        <h2 id="privacy-rights-requests-heading" className="font-semibold text-lg">
          Solicitudes de derechos
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Solicitudes vinculadas al responsable y a la versión del aviso que la persona consultó.
        </p>
      </div>

      {!canManage ? (
        <p className="text-muted-foreground text-sm">
          Solo administradores y propietarios pueden consultar y atender estas solicitudes.
        </p>
      ) : loading ? (
        <p className="text-muted-foreground text-sm">Cargando solicitudes…</p>
      ) : error ? (
        <div role="alert" className="space-y-2">
          <p className="text-destructive text-sm">{error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadRequests(application.id, page)}
          >
            Reintentar
          </Button>
        </div>
      ) : requests.length === 0 ? (
        <p className="rounded-md border p-4 text-muted-foreground text-sm">
          Aún no hay solicitudes de derechos.
        </p>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const draft = drafts[request.id] ?? {
              status: request.status,
              response: request.response,
              reason: request.reason,
            };
            return (
              <article key={request.id} className="space-y-3 rounded-lg border p-4">
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p>Responsable: {request.responsibleEntity}</p>
                  <p>Finalidad: {request.purpose}</p>
                  <p>Recibida: {new Date(request.createdAt).toLocaleString("es-PE")}</p>
                  <p>Tipo: {typeLabels[request.type]}</p>
                  <p>Estado: {statusLabels[request.status]}</p>
                  <p>Aviso: versión {request.noticeVersion}</p>
                  <p>Contacto: {request.contactEmail}</p>
                  <p>Canal declarado: {request.rightsChannel}</p>
                </div>
                {request.details && (
                  <p className="whitespace-pre-wrap text-sm">{request.details}</p>
                )}
                <label className="block space-y-1 text-sm">
                  <span>Estado</span>
                  <select
                    className="h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm"
                    value={draft.status}
                    disabled={!!savingId}
                    onChange={(event) =>
                      updateDraft(request.id, {
                        status: event.target.value as Draft["status"],
                      })
                    }
                  >
                    {PRIVACY_RIGHTS_REQUEST_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
                {draft.status === "answered" && (
                  <label className="block space-y-1 text-sm">
                    <span>Respuesta</span>
                    <textarea
                      className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                      maxLength={4000}
                      value={draft.response}
                      disabled={!!savingId}
                      onChange={(event) =>
                        updateDraft(request.id, { response: event.target.value })
                      }
                    />
                  </label>
                )}
                {draft.status === "notApplicable" && (
                  <label className="block space-y-1 text-sm">
                    <span>Motivo y canal de reclamación aplicable</span>
                    <textarea
                      className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                      maxLength={1000}
                      value={draft.reason}
                      disabled={!!savingId}
                      onChange={(event) => updateDraft(request.id, { reason: event.target.value })}
                    />
                  </label>
                )}
                <Button type="button" disabled={!!savingId} onClick={() => void save(request.id)}>
                  {savingId === request.id ? "Guardando…" : "Guardar actualización"}
                </Button>
              </article>
            );
          })}
          <nav aria-label="Páginas de solicitudes" className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={page === 1 || loading}
              onClick={() => setPage((current) => current - 1)}
            >
              Anteriores
            </Button>
            <span className="text-muted-foreground text-sm">Página {page}</span>
            <Button
              type="button"
              variant="outline"
              disabled={!hasMore || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              Siguientes
            </Button>
          </nav>
        </div>
      )}
    </section>
  );
}
