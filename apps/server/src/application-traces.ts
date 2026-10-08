import {
  type ApplicationTraceMetricsQuery,
  type ApplicationTraceMetricsResponse,
  type ApplicationTracePageQuery,
  type ApplicationTraceRecord,
  applicationTraceMetricsQuerySchema,
  applicationTracePageQuerySchema,
} from "@ayni/api/application-traces";
import { type Context, Hono } from "hono";
import type { SdkTraceArtifactMetadata } from "@ayni/api/sdk-trace-artifact";
import { type Application, getApplicationForMember } from "./applications";
import { isUuid } from "./lib/uuid";
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
    getMetrics: (
      query: ApplicationTraceMetricsQuery & { applicationId: string },
    ) => Promise<ApplicationTraceMetricsResponse>;
    list: (
      query: ApplicationTracePageQuery & { applicationId: string },
    ) => Promise<ApplicationTracePage>;
    get: (applicationId: string, traceId: string) => Promise<ApplicationTraceRecord | undefined>;
    getArtifact?: (
      applicationId: string,
      traceId: string,
      artifactId: string,
    ) => Promise<
      | {
          artifact: SdkTraceArtifactMetadata;
          body: ReadableStream<Uint8Array>;
          contentLength?: number;
        }
      | undefined
    >;
    listRecords: (
      query: ApplicationTracePageQuery & { applicationId: string },
    ) => Promise<ApplicationTraceRecordPage>;
  };
};

const BAD_QUERY = "La consulta de trazas no es válida.";
const NOT_FOUND = "No encontramos esta aplicación o traza.";
const EXPORT_PAGE_SIZE = 10;

function artifactDisposition(logicalName: string) {
  const safeName =
    logicalName
      .normalize("NFC")
      .replace(/[\\/\u0000-\u001f\u007f"<>:*?|\u202a-\u202e\u2066-\u2069]/g, "_")
      .trim() || "perfetto-trace.bin";
  const asciiName = safeName.replace(/[^\x20-\x7e]/g, "_");
  let encodedName: string;
  try {
    encodedName = encodeURIComponent(safeName).replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  } catch {
    encodedName = encodeURIComponent(asciiName);
  }
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}

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

  app.get("/applications/:applicationId/traces/metrics", async (c) => {
    const access = await authorize(c);
    if ("response" in access) return access.response;
    const parsed = applicationTraceMetricsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ message: BAD_QUERY }, 400);
    return c.json(
      await traces.getMetrics({ applicationId: access.application.id, ...parsed.data }),
    );
  });

  app.get("/applications/:applicationId/traces/:traceId/artifacts/:artifactId", async (c) => {
    const access = await authorize(c);
    if ("response" in access) return access.response;
    const traceId = c.req.param("traceId");
    const artifactId = c.req.param("artifactId");
    if (!isUuid(traceId) || !isUuid(artifactId)) return c.json({ message: BAD_QUERY }, 400);
    const found = await traces.getArtifact?.(access.application.id, traceId, artifactId);
    if (!found) return c.json({ message: NOT_FOUND }, 404);
    return new Response(found.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": artifactDisposition(found.artifact.logicalName),
        "Content-Length": String(found.contentLength ?? found.artifact.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  });

  app.get("/applications/:applicationId/traces/:traceId", async (c) => {
    const access = await authorize(c);
    if ("response" in access) return access.response;
    const traceId = c.req.param("traceId");
    if (!isUuid(traceId)) {
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
