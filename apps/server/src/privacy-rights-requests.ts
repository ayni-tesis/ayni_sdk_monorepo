import {
  createPrivacyRightsRequestSchema,
  updatePrivacyRightsRequestSchema,
} from "@ayni/api/privacy-rights-request";
import { Hono } from "hono";
import { z } from "zod";
import type { Application } from "./applications";
import { checkRateLimit } from "./lib/rate-limit";
import type {
  createPrivacyRightsRequest,
  getPublicPrivacyRightsRequest,
  listPrivacyRightsRequests,
  updatePrivacyRightsRequest,
} from "./privacy-rights-request-store";
import type { PublishedPrivacyNotice } from "./privacy-treatment-map-store";

const NOT_FOUND_MESSAGE = "No encontramos esta solicitud.";
const APPLICATION_NOT_FOUND_MESSAGE = "No encontramos esta aplicación.";
const INVALID_MESSAGE =
  "No pudimos registrar la solicitud. Inténtalo nuevamente o usa el canal de contacto del responsable.";

type Dependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  applications: {
    get: (id: string) => Promise<Application | undefined>;
    getMembership: (userId: string, organizationId: string) => Promise<string | undefined>;
  };
  privacyMaps: {
    getPublished: (applicationId: string) => Promise<PublishedPrivacyNotice | undefined>;
  };
  requests: {
    create: typeof createPrivacyRightsRequest;
    getPublic: typeof getPublicPrivacyRightsRequest;
    list: typeof listPrivacyRightsRequests;
    update: typeof updatePrivacyRightsRequest;
  };
  database: Parameters<typeof createPrivacyRightsRequest>[0];
  rateLimit?: (key: string) => Promise<{ success: boolean }>;
};

export function createPrivacyRightsRequestsApp({
  getSession,
  applications,
  privacyMaps,
  requests,
  database,
  rateLimit = checkRateLimit,
}: Dependencies) {
  const app = new Hono();

  app.post("/applications/:applicationId/privacy-requests", async (c) => {
    const applicationId = c.req.param("applicationId");
    if (!(await rateLimit(`privacy-request:create:${applicationId}`)).success) {
      return c.json({ message: "Demasiadas solicitudes. Inténtalo más tarde." }, 429);
    }
    const application = await applications.get(applicationId);
    if (application?.status !== "active") {
      return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    }
    const notice = await privacyMaps.getPublished(applicationId);
    if (!notice) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ message: INVALID_MESSAGE }, 400);
    }
    const parsed = createPrivacyRightsRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ message: INVALID_MESSAGE }, 400);
    }

    const treatment = notice.treatments.find(({ id }) => id === parsed.data.treatmentId);
    if (
      treatment?.dataContext !== "clientApplication" ||
      !treatment.roleEntity ||
      !treatment.rightsChannel
    ) {
      return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    }

    const saved = await requests.create(database, {
      ...parsed.data,
      applicationId,
      noticeVersion: notice.version,
      purpose: treatment.purpose,
      responsibleEntity: treatment.roleEntity,
      rightsChannel: treatment.rightsChannel,
    });
    return c.json(
      {
        requestNumber: saved.id,
        status: saved.status,
        createdAt: saved.createdAt,
        message:
          "Solicitud recibida. Guarda este número en un lugar privado para consultar su estado y respuesta.",
      },
      201,
    );
  });

  app.get("/privacy-requests/:requestId", async (c) => {
    const parsedId = z.uuid().safeParse(c.req.param("requestId"));
    if (!parsedId.success) return c.json({ message: NOT_FOUND_MESSAGE }, 404);
    if (!(await rateLimit(`privacy-request:lookup:${parsedId.data}`)).success) {
      return c.json({ message: "Demasiadas consultas. Inténtalo más tarde." }, 429);
    }
    const request = await requests.getPublic(database, parsedId.data);
    if (!request) return c.json({ message: NOT_FOUND_MESSAGE }, 404);
    return c.json({ request });
  });

  app.get("/applications/:applicationId/privacy-requests", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);
    const application = await applications.get(c.req.param("applicationId"));
    if (!application) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    const role = await applications.getMembership(session.user.id, application.organizationId);
    if (!role) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    if (role !== "admin" && role !== "owner") {
      return c.json({ message: "No tienes permiso para consultar estas solicitudes." }, 403);
    }
    if (!(await rateLimit(`privacy-request:list:${application.id}:${session.user.id}`)).success) {
      return c.json({ message: "Demasiadas consultas. Inténtalo más tarde." }, 429);
    }
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(1_000_000)
      .safeParse(c.req.query("page") ?? "1");
    if (!page.success) return c.json({ message: "La página solicitada no es válida." }, 400);
    const result = await requests.list(database, {
      applicationId: application.id,
      userId: session.user.id,
      page: page.data,
    });
    if (!result.ok) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    return c.json({ requests: result.requests, page: page.data, hasMore: result.hasMore });
  });

  app.patch("/applications/:applicationId/privacy-requests/:requestId", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);
    const application = await applications.get(c.req.param("applicationId"));
    if (!application) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    const role = await applications.getMembership(session.user.id, application.organizationId);
    if (!role) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    if (role !== "admin" && role !== "owner") {
      return c.json({ message: "No tienes permiso para atender estas solicitudes." }, 403);
    }

    const parsedId = z.uuid().safeParse(c.req.param("requestId"));
    if (!parsedId.success) return c.json({ message: NOT_FOUND_MESSAGE }, 404);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: "La respuesta de la solicitud no es válida." }, 400);
    }
    const parsed = updatePrivacyRightsRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { message: "Indica una respuesta para completar la solicitud o un motivo si no procede." },
        400,
      );
    }

    const result = await requests.update(database, {
      ...parsed.data,
      applicationId: application.id,
      requestId: parsedId.data,
      userId: session.user.id,
    });
    if (result.ok) return c.json({ request: result.request });
    if (result.reason === "forbidden") {
      return c.json({ message: "No tienes permiso para atender estas solicitudes." }, 403);
    }
    return c.json({ message: NOT_FOUND_MESSAGE }, 404);
  });

  return app;
}
