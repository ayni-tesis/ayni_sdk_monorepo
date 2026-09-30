import { updatePrivacyMapSchema } from "@ayni/api/privacy-treatment";
import { Hono } from "hono";
import { type Application, getApplicationForMember } from "./applications";
import type {
  PrivacyTreatmentMap,
  PublishedPrivacyNotice,
  PublishPrivacyNoticeResult,
  UpdatePrivacyTreatmentMapInput,
  UpdatePrivacyTreatmentMapResult,
} from "./privacy-treatment-map-store";

const NOT_FOUND_MESSAGE = "No encontramos esta aplicación.";
const INVALID_MAP_MESSAGE = "El mapa de tratamientos no es válido.";
const EXTRA_FIELD_MESSAGE = "El mapa contiene campos no permitidos.";

type Dependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  applications: {
    get: (id: string) => Promise<Application | undefined>;
    getMembership: (userId: string, organizationId: string) => Promise<string | undefined>;
  };
  privacyMaps: {
    get: (applicationId: string) => Promise<PrivacyTreatmentMap>;
    getPublished: (applicationId: string) => Promise<PublishedPrivacyNotice | undefined>;
    update: (input: UpdatePrivacyTreatmentMapInput) => Promise<UpdatePrivacyTreatmentMapResult>;
    publish: (input: {
      applicationId: string;
      userId: string;
    }) => Promise<PublishPrivacyNoticeResult>;
  };
};

export function createPrivacyTreatmentMapApp({
  getSession,
  applications,
  privacyMaps,
}: Dependencies) {
  const app = new Hono();

  app.get("/applications/:applicationId/privacy-notice", async (c) => {
    const notice = await privacyMaps.getPublished(c.req.param("applicationId"));
    if (!notice) {
      return c.json({ message: "La aplicación aún no publicó su aviso de privacidad." }, 404);
    }
    return c.json({ notice });
  });

  app.get("/applications/:applicationId/privacy-treatment-map", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getApplicationForMember(
      applications,
      c.req.param("applicationId"),
      session.user.id,
    );
    if (!application) {
      return c.json({ message: NOT_FOUND_MESSAGE }, 404);
    }

    return c.json({ map: await privacyMaps.get(application.id) });
  });

  app.put("/applications/:applicationId/privacy-treatment-map", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getApplicationForMember(
      applications,
      c.req.param("applicationId"),
      session.user.id,
    );
    if (!application) return c.json({ message: NOT_FOUND_MESSAGE }, 404);

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ message: INVALID_MAP_MESSAGE }, 400);
    }

    const parsed = updatePrivacyMapSchema.safeParse(rawBody);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const message =
        issue?.code === "unrecognized_keys" ? EXTRA_FIELD_MESSAGE : INVALID_MAP_MESSAGE;
      return c.json({ message }, 400);
    }

    const result = await privacyMaps.update({
      applicationId: application.id,
      userId: session.user.id,
      treatments: parsed.data.treatments,
    });

    if (result.ok === true) return c.json({ map: result.map });
    if (result.reason === "forbidden") {
      return c.json({ message: "No tienes permiso para editar el mapa de tratamientos." }, 403);
    }
    if (result.reason === "archived") {
      return c.json(
        { message: "No puedes editar los tratamientos de una aplicación archivada." },
        409,
      );
    }

    return c.json({ message: NOT_FOUND_MESSAGE }, 404);
  });

  app.post("/applications/:applicationId/privacy-notice/publish", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getApplicationForMember(
      applications,
      c.req.param("applicationId"),
      session.user.id,
    );
    if (!application) {
      return c.json({ message: NOT_FOUND_MESSAGE }, 404);
    }

    const result = await privacyMaps.publish({
      applicationId: application.id,
      userId: session.user.id,
    });
    if (result.ok) return c.json({ version: result.version }, 201);
    if (result.reason === "incomplete") {
      return c.json(
        {
          message: "Confirma los tratamientos pendientes antes de publicar el aviso.",
          pendingTreatments: result.pendingTreatments,
        },
        409,
      );
    }
    if (result.reason === "forbidden") {
      return c.json({ message: "No tienes permiso para publicar el aviso de privacidad." }, 403);
    }
    if (result.reason === "archived") {
      return c.json({ message: "No puedes publicar el aviso de una aplicación archivada." }, 409);
    }

    return c.json({ message: NOT_FOUND_MESSAGE }, 404);
  });

  return app;
}
