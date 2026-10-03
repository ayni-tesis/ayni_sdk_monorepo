import {
  type ApplicationTracePageQuery,
  type ApplicationTraceRecord,
  applicationTracePageQuerySchema,
} from "@ayni/api/application-traces";
import { type Context, Hono } from "hono";
import { type Application, getApplicationForMember } from "./applications";
import {
  type ApplicationTracePage,
  type ApplicationTraceRecordPage,
  InvalidApplicationTraceCursorError,
} from "./sdk-trace-store";

type Dependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  applications: {
    get: (id: string) => Promise<Application | undefined>;
    getMembership: (userId: string, organizationId: string) => Promise<string | undefined>;
  };
  traces: {
    list: (
      query: ApplicationTracePageQuery & { applicationId: string },
    ) => Promise<ApplicationTracePage>;
    get: (applicationId: string, traceId: string) => Promise<ApplicationTraceRecord | undefined>;
    listRecords: (
      query: ApplicationTracePageQuery & { applicationId: string },
    ) => Promise<ApplicationTraceRecordPage>;
  };
};

const BAD_QUERY = "La consulta de trazas no es válida.";
const NOT_FOUND = "No encontramos esta aplicación o traza.";
const EXPORT_PAGE_SIZE = 10;

export function createApplicationTracesApp({ getSession, applications, traces }: Dependencies) {
  const app = new Hono();

  async function authorize(c: Context) {
    const session = await getSession(c.req.raw.headers);
    if (!session) return { response: c.json({ message: "Authentication required" }, 401) };
    const application = await getApplicationForMember(
      applications,
      c.req.param("applicationId") ?? "",
      session.user.id,
    );
    if (!application)
      return { response: c.json({ message: "No encontramos esta aplicación." }, 404) };
    return { application };
  }

  app.get("/applications/:applicationId/traces/export", async (c) => {
    const access = await authorize(c);
    if ("response" in access) return access.response;

    const encoder = new TextEncoder();
    let cursor: string | undefined;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const page = await traces.listRecords({
            applicationId: access.application.id,
            limit: EXPORT_PAGE_SIZE,
            ...(cursor ? { cursor } : {}),
          });
          for (const record of page.records)
            controller.enqueue(encoder.encode(`${JSON.stringify(record)}\n`));
          cursor = page.nextCursor ?? undefined;
          if (!cursor) controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": 'attachment; filename="application-traces.jsonl"',
        "Cache-Control": "no-store",
      },
    });
  });

  app.get("/applications/:applicationId/traces/:traceId", async (c) => {
    const access = await authorize(c);
    if ("response" in access) return access.response;
    const traceId = c.req.param("traceId");
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(traceId)
    ) {
      return c.json({ message: BAD_QUERY }, 400);
    }
    const record = await traces.get(access.application.id, traceId);
    if (!record) return c.json({ message: NOT_FOUND }, 404);
    return c.json({ record });
  });

  app.get("/applications/:applicationId/traces", async (c) => {
    const access = await authorize(c);
    if ("response" in access) return access.response;
    const parsed = applicationTracePageQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ message: BAD_QUERY }, 400);
    try {
      return c.json(await traces.list({ applicationId: access.application.id, ...parsed.data }));
    } catch (error) {
      if (error instanceof InvalidApplicationTraceCursorError)
        return c.json({ message: BAD_QUERY }, 400);
      throw error;
    }
  });

  return app;
}
