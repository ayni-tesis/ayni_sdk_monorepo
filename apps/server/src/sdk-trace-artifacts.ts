import {
  SDK_TRACE_ARTIFACT_MAX_BYTES,
  sdkTraceArtifactUploadIntentSchema,
  sdkTraceArtifactUploadRequestSchema,
} from "@ayni/api/sdk-trace-artifact";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { isUuid } from "./lib/uuid";
import { INVALID_CREDENTIAL_MESSAGE, type VerifySdkCredentialResult } from "./sdk-credential-store";
import type { CompleteSdkTraceArtifactResult } from "./sdk-trace-artifact-store";
import type { TelemetryPolicy } from "./telemetry-policy-store";

type Dependencies = {
  credentials: { verify: (secret: string) => Promise<VerifySdkCredentialResult> };
  policies: { get: (applicationId: string) => Promise<TelemetryPolicy> };
  artifacts: {
    createUploadIntent(input: {
      applicationId: string;
      traceId: string;
      artifact: ReturnType<typeof sdkTraceArtifactUploadRequestSchema.parse>;
    }): Promise<
      | {
          ok: true;
          artifactId: string;
          uploadUrl: string;
          uploadUrlExpiresAt: string;
          requiredHeaders: {
            "Content-Type": "application/octet-stream";
            "Content-Length": string;
          };
        }
      | { ok: false; reason: "traceNotFound" }
    >;
    complete(
      input: { applicationId: string; traceId: string; artifactId: string },
      isTelemetryEnabled: () => Promise<boolean>,
    ): Promise<CompleteSdkTraceArtifactResult>;
  };
};

const BAD_REQUEST = "La solicitud del artefacto no es válida.";
const NOT_FOUND = "No encontramos esta traza o artefacto.";

export function createSdkTraceArtifactsApp({ credentials, policies, artifacts }: Dependencies) {
  const app = new Hono();

  async function authorize(c: Context) {
    const bearer = /^bearer +([^\s]+)$/i.exec(c.req.header("Authorization") ?? "");
    const secret = bearer?.[1];
    if (!secret || !/^ayni_sk_[A-Za-z0-9_-]+$/.test(secret)) {
      return {
        response: c.json({ message: INVALID_CREDENTIAL_MESSAGE, code: "invalidCredential" }, 401),
      };
    }
    const verified = await credentials.verify(secret);
    if (verified.ok === false) {
      return { response: c.json({ message: verified.message, code: verified.code }, 401) };
    }
    return { applicationId: verified.credential.applicationId };
  }

  app.post(
    "/sdk/traces/:traceId/artifacts",
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) =>
        c.json(
          { message: "El artefacto supera el tamaño máximo permitido.", code: "artifactTooLarge" },
          413,
        ),
    }),
    async (c) => {
      const access = await authorize(c);
      if ("response" in access) return access.response;

      const traceId = c.req.param("traceId");
      if (!isUuid(traceId)) return c.json({ message: BAD_REQUEST, code: "invalidArtifact" }, 400);
      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch {
        return c.json({ message: BAD_REQUEST, code: "invalidArtifact" }, 400);
      }
      if (
        typeof rawBody === "object" &&
        rawBody !== null &&
        "byteLength" in rawBody &&
        typeof rawBody.byteLength === "number" &&
        rawBody.byteLength > SDK_TRACE_ARTIFACT_MAX_BYTES
      ) {
        return c.json(
          { message: "El artefacto supera el tamaño máximo permitido.", code: "artifactTooLarge" },
          413,
        );
      }
      const parsed = sdkTraceArtifactUploadRequestSchema.safeParse(rawBody);
      if (!parsed.success) return c.json({ message: BAD_REQUEST, code: "invalidArtifact" }, 400);

      if (!(await policies.get(access.applicationId)).enabled) {
        return c.json(
          {
            message: "La política de telemetría de esta aplicación está deshabilitada.",
            code: "telemetryDisabled",
          },
          403,
        );
      }

      const result = await artifacts.createUploadIntent({
        applicationId: access.applicationId,
        traceId,
        artifact: parsed.data,
      });
      if (!result.ok) return c.json({ message: NOT_FOUND, code: "traceNotFound" }, 404);
      const intent = sdkTraceArtifactUploadIntentSchema.safeParse(result);
      if (!intent.success) throw new Error("Invalid SDK trace artifact upload intent");
      return c.json(intent.data, 201);
    },
  );

  app.post(
    "/sdk/traces/:traceId/artifacts/:artifactId/complete",
    bodyLimit({
      maxSize: 1024,
      onError: (c) => c.json({ message: BAD_REQUEST, code: "invalidArtifact" }, 413),
    }),
    async (c) => {
      const access = await authorize(c);
      if ("response" in access) return access.response;

      const traceId = c.req.param("traceId");
      const artifactId = c.req.param("artifactId");
      if (!isUuid(traceId) || !isUuid(artifactId))
        return c.json({ message: BAD_REQUEST, code: "invalidArtifact" }, 400);
      const result = await artifacts.complete(
        { applicationId: access.applicationId, traceId, artifactId },
        async () => (await policies.get(access.applicationId)).enabled,
      );
      return completeResponse(c, result);
    },
  );

  return app;
}

function completeResponse(c: Context, result: CompleteSdkTraceArtifactResult) {
  if (result.ok) return c.json({ artifact: result.artifact }, 200);
  switch (result.reason) {
    case "traceNotFound":
    case "artifactNotFound":
      return c.json({ message: NOT_FOUND, code: "artifactNotFound" }, 404);
    case "uploadExpired":
      return c.json(
        { message: "La carga del artefacto venció.", code: "artifactUploadExpired" },
        409,
      );
    case "uploadInProgress":
      return c.json(
        {
          message: "La carga del artefacto aún se está verificando.",
          code: "artifactUploadInProgress",
        },
        409,
      );
    case "invalidContent":
      return c.json(
        {
          message: "El archivo no coincide con el tamaño, SHA-256 o formato permitidos.",
          code: "invalidArtifactContent",
        },
        400,
      );
    case "sourceChanged":
      return c.json(
        { message: "El archivo cambió durante la verificación.", code: "artifactUploadChanged" },
        409,
      );
    case "telemetryDisabled":
      return c.json(
        {
          message: "La política de telemetría de esta aplicación está deshabilitada.",
          code: "telemetryDisabled",
        },
        403,
      );
  }
}
