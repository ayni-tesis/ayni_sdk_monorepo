import { updatePrivacyMapSchema } from "@ayni/api/privacy-treatment";
import { Hono } from "hono";
import type { Application } from "./applications";
import type {
  PrivacyTreatmentMap,
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
    update: (input: UpdatePrivacyTreatmentMapInput) => Promise<UpdatePrivacyTreatmentMapResult>;
  };
};

export function createPrivacyTreatmentMapApp({
  getSession,
  applications,
  privacyMaps,
}: Dependencies) {
  const app = new Hono();

  app.get("/applications/:applicationId/privacy-treatment-map", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (
      !application ||
      !(await applications.getMembership(session.user.id, application.organizationId))
    ) {
      return c.json({ message: NOT_FOUND_MESSAGE }, 404);
    }

    return c.json({ map: await privacyMaps.get(application.id) });
  });

  app.put("/applications/:applicationId/privacy-treatment-map", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (!application) return c.json({ message: NOT_FOUND_MESSAGE }, 404);
    if (!(await applications.getMembership(session.user.id, application.organizationId))) {
      return c.json({ message: NOT_FOUND_MESSAGE }, 404);
    }

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

  return app;
}
