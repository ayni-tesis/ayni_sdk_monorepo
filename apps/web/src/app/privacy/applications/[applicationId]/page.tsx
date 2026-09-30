import type { PrivacyTreatment } from "@ayni/api/privacy-treatment";
import { env } from "@ayni/env/web";
import { PrivacyRightsRequestForm } from "./privacy-rights-request-form";

export type Notice = {
  version: number;
  publishedAt: string;
  treatments: PrivacyTreatment[];
};

async function getNotice(applicationId: string): Promise<Notice | "missing" | "error"> {
  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_SERVER_URL}/applications/${encodeURIComponent(applicationId)}/privacy-notice`,
      { cache: "no-store" },
    );
    if (response.status === 404) return "missing";
    if (!response.ok) return "error";
    const body = (await response.json()) as { notice: Notice };
    return body.notice;
  } catch {
    return "error";
  }
}

const roleLabels = {
  controller: "Responsable declarado",
  processor: "Encargado declarado",
  undetermined: "Rol pendiente de confirmar",
} as const;

export default async function ApplicationPrivacyNoticePage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const result = await getNotice(applicationId);

  if (result === "missing" || result === "error") {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-8">
        <h1 className="font-semibold text-3xl">Aviso de privacidad</h1>
        <p role="alert">
          {result === "missing"
            ? "La aplicación aún no publicó su aviso de privacidad."
            : "No pudimos cargar el aviso de privacidad."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <header className="space-y-2">
        <h1 className="font-semibold text-3xl">Aviso de privacidad</h1>
        <p>
          Versión {result.version} · Vigente desde{" "}
          {new Date(result.publishedAt).toLocaleDateString("es-PE", {
            dateStyle: "long",
            timeZone: "UTC",
          })}
        </p>
        <p className="text-muted-foreground text-sm">
          Información declarada por la aplicación. Su publicación técnica no constituye una
          validación legal de Ayni.
        </p>
      </header>

      {result.treatments.map((treatment, index) => (
        <section key={treatment.id} className="space-y-3 border-t pt-5">
          <h2 className="font-semibold text-xl">
            Finalidad {index + 1}: {treatment.purpose}
          </h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="font-medium">Rol y entidad declarada</dt>
              <dd>
                {roleLabels[treatment.role]}: {treatment.roleEntity || "Nombre no declarado"}
              </dd>
            </div>
            <div>
              <dt className="font-medium">A quién corresponden los datos</dt>
              <dd>
                {treatment.dataContext === "ayniPlatform"
                  ? "Operación de Ayni"
                  : treatment.dataContext === "clientApplication"
                    ? "Usuarios de la aplicación"
                    : "Pendiente de confirmar"}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Fuente</dt>
              <dd>{treatment.source}</dd>
            </div>
            <div>
              <dt className="font-medium">Campos</dt>
              <dd>{treatment.requirement === "required" ? "Obligatorios" : "Opcionales"}</dd>
            </div>
            <div>
              <dt className="font-medium">Datos tratados</dt>
              <dd>{treatment.dataCategories.join(", ")}</dd>
            </div>
            <div>
              <dt className="font-medium">Base declarada</dt>
              <dd>{treatment.legalBasis}</dd>
            </div>
            <div>
              <dt className="font-medium">Destinatarios</dt>
              <dd>{treatment.recipients.join(", ")}</dd>
            </div>
            <div>
              <dt className="font-medium">Transferencias</dt>
              <dd>{treatment.transfers}</dd>
            </div>
            <div>
              <dt className="font-medium">Conservación</dt>
              <dd>{treatment.retention}</dd>
            </div>
            <div>
              <dt className="font-medium">Canal de derechos</dt>
              <dd>{treatment.rightsChannel}</dd>
            </div>
          </dl>
          <div>
            <h3 className="font-medium">Políticas aplicables</h3>
            {treatment.policyLinks.length ? (
              <ul className="list-inside list-disc">
                {treatment.policyLinks.map(({ label, url }) => (
                  <li key={url}>
                    <a
                      className="text-primary underline"
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                No se declararon otras políticas aplicables.
              </p>
            )}
          </div>
        </section>
      ))}
      <PrivacyRightsRequestForm applicationId={applicationId} treatments={result.treatments} />
    </main>
  );
}
