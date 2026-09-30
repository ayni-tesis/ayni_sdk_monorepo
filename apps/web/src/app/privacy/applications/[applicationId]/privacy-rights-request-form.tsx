"use client";

import { PRIVACY_RIGHTS_REQUEST_TYPES } from "@ayni/api/privacy-rights-request";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { httpClient } from "@/lib/http-client";

const typeLabels = {
  access: "Acceso",
  rectification: "Actualización o rectificación",
  cancellation: "Cancelación",
  opposition: "Oposición",
  portability: "Portabilidad (cuando corresponda)",
} as const;
const statusLabels: Record<string, string> = {
  received: "Recibida",
  inReview: "En revisión",
  answered: "Respondida",
  notApplicable: "No procede",
};

type Treatment = {
  id: string;
  purpose: string;
  dataContext: string;
  roleEntity: string;
  rightsChannel: string;
};

type PublicRequest = {
  id: string;
  type: string;
  status: string;
  response: string;
  reason: string;
  createdAt: string;
};

export function PrivacyRightsRequestForm({
  applicationId,
  treatments,
}: {
  applicationId: string;
  treatments: Treatment[];
}) {
  const eligibleTreatments = treatments.filter(
    ({ dataContext, roleEntity, rightsChannel }) =>
      dataContext === "clientApplication" && roleEntity && rightsChannel,
  );
  const [treatmentId, setTreatmentId] = useState(eligibleTreatments[0]?.id ?? "");
  const [contactEmail, setContactEmail] = useState("");
  const [details, setDetails] = useState("");
  const [requestType, setRequestType] = useState<(typeof PRIVACY_RIGHTS_REQUEST_TYPES)[number]>(
    "access",
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string; message: string } | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [requestNumber, setRequestNumber] = useState("");
  const [status, setStatus] = useState<PublicRequest | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const selectedTreatment = eligibleTreatments.find(({ id }) => id === treatmentId);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!treatmentId || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    setSubmitted(null);
    try {
      const { data } = await httpClient.post<{ requestNumber: string; message: string }>(
        `/applications/${applicationId}/privacy-requests`,
        { treatmentId, type: requestType, contactEmail, details },
      );
      setSubmitted({ id: data.requestNumber, message: data.message });
      setContactEmail("");
      setDetails("");
    } catch {
      setSubmitError(
        "No pudimos registrar la solicitud. Inténtalo nuevamente o usa el canal de contacto del responsable.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function lookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLookingUp(true);
    setLookupError("");
    setStatus(null);
    try {
      const { data } = await httpClient.get<{ request: PublicRequest }>(
        `/privacy-requests/${encodeURIComponent(requestNumber.trim())}`,
      );
      setStatus(data.request);
    } catch {
      setLookupError("No encontramos esta solicitud. Verifica el número e inténtalo nuevamente.");
    } finally {
      setLookingUp(false);
    }
  }

  if (!eligibleTreatments.length) return null;

  return (
    <section aria-labelledby="privacy-rights-heading" className="space-y-5 border-t pt-6">
      <div className="space-y-2">
        <h2 id="privacy-rights-heading" className="font-semibold text-2xl">
          Solicitar o consultar mis derechos
        </h2>
        <p className="text-sm text-muted-foreground">
          Este canal atiende datos tratados por esta aplicación. Las solicitudes sobre cuentas
          Ayni se atienden por separado; Ayni publicará su canal cuando su aviso esté vigente. No
          incluyas documentos ni información que no sea necesaria para ubicar y atender tu solicitud.
        </p>
      </div>

      <form onSubmit={submit} className="max-w-xl space-y-4 rounded-lg border p-4">
        <h3 className="font-medium">Enviar una solicitud</h3>
        <label className="block space-y-1 text-sm">
          <span>Finalidad y responsable</span>
          <select
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={treatmentId}
            required
            onChange={(event) => setTreatmentId(event.target.value)}
          >
            {eligibleTreatments.map((treatment) => (
              <option key={treatment.id} value={treatment.id}>
                {treatment.purpose} · {treatment.roleEntity}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span>Tipo de solicitud</span>
          <select
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={requestType}
            onChange={(event) =>
              setRequestType(event.target.value as (typeof PRIVACY_RIGHTS_REQUEST_TYPES)[number])
            }
          >
            {PRIVACY_RIGHTS_REQUEST_TYPES.map((type) => (
              <option key={type} value={type}>
                {typeLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span>Correo de contacto</span>
          <Input
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
          />
        </label>
        {selectedTreatment && (
          <p className="rounded-md bg-muted/40 p-3 text-sm">
            Responsable: {selectedTreatment.roleEntity}. Canal publicado: {selectedTreatment.rightsChannel}.
            Consulta el estado y la respuesta con el número de solicitud.
          </p>
        )}
        <label className="block space-y-1 text-sm">
          <span>Información adicional necesaria (opcional)</span>
          <textarea
            className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            maxLength={2000}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
        </label>
        {submitError && <p role="alert" className="text-destructive text-sm">{submitError}</p>}
        {submitted && (
          <p role="status" className="space-y-1 text-sm">
            <span className="block">{submitted.message}</span>
            <code className="block select-all break-all">{submitted.id}</code>
            <span className="block">Mantén este número privado; permite consultar tu respuesta.</span>
          </p>
        )}
        <Button type="submit" disabled={submitting || !treatmentId}>
          {submitting ? "Enviando solicitud…" : "Enviar solicitud"}
        </Button>
      </form>

      <form onSubmit={lookup} className="max-w-xl space-y-3 rounded-lg border p-4">
        <h3 className="font-medium">Consultar el estado</h3>
        <label className="block space-y-1 text-sm">
          <span>Número de solicitud</span>
          <Input
            autoComplete="off"
            required
            value={requestNumber}
            onChange={(event) => setRequestNumber(event.target.value)}
          />
        </label>
        {lookupError && <p role="alert" className="text-destructive text-sm">{lookupError}</p>}
        {status && (
          <div role="status" className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
            <p>Estado: {statusLabels[status.status] ?? status.status}</p>
            <p>Solicitud: {typeLabels[status.type as keyof typeof typeLabels] ?? status.type}</p>
            {status.response && <p>Respuesta: {status.response}</p>}
            {status.reason && <p>Motivo: {status.reason}</p>}
          </div>
        )}
        <Button type="submit" variant="outline" disabled={lookingUp || !requestNumber.trim()}>
          {lookingUp ? "Consultando…" : "Consultar estado"}
        </Button>
      </form>
    </section>
  );
}
