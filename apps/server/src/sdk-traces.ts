import { SDK_TRACE_MAX_BYTES, sdkTraceSchema } from "@ayni/api/sdk-trace";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { INVALID_CREDENTIAL_MESSAGE, type VerifySdkCredentialResult } from "./sdk-credential-store";
import type { StoreSdkTraceResult } from "./sdk-trace-store";
import type { TelemetryPolicy } from "./telemetry-policy-store";

type Dependencies = {
  credentials: { verify: (secret: string) => Promise<VerifySdkCredentialResult> };
  policies: { get: (applicationId: string) => Promise<TelemetryPolicy> };
  traces: {
    store: (
      applicationId: string,
      trace: ReturnType<typeof sdkTraceSchema.parse>,
      retentionDays: 7 | 30 | 90,
    ) => Promise<StoreSdkTraceResult>;
  };
};

export function createSdkTracesApp({ credentials, policies, traces }: Dependencies) {
  const app = new Hono();

  app.post(
    "/sdk/traces",
    bodyLimit({
      maxSize: SDK_TRACE_MAX_BYTES,
      onError: (c) =>
        c.json(
          { message: "La traza supera el tamaño máximo permitido.", code: "traceTooLarge" },
          413,
        ),
    }),
    async (c) => {
      const bearer = /^bearer +([^\s]+)$/i.exec(c.req.header("Authorization") ?? "");
      const secret = bearer?.[1];
      if (!secret || !/^ayni_sk_[A-Za-z0-9_-]+$/.test(secret)) {
        return c.json({ message: INVALID_CREDENTIAL_MESSAGE, code: "invalidCredential" }, 401);
      }

      const verified = await credentials.verify(secret);
      if (verified.ok === false) {
        return c.json({ message: verified.message, code: verified.code }, 401);
      }

      const policy = await policies.get(verified.credential.applicationId);
      if (!policy.enabled) {
        return c.json(
          {
            message: "La política de telemetría de esta aplicación está deshabilitada.",
            code: "telemetryDisabled",
          },
          403,
        );
      }

      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch {
        return c.json(
          { message: "La traza no tiene un formato válido.", code: "invalidTrace" },
          400,
        );
      }

      const parsed = sdkTraceSchema.safeParse(rawBody);
      if (!parsed.success) {
        return c.json(
          { message: "La traza no tiene un formato válido.", code: "invalidTrace" },
          400,
        );
      }

      const result = await traces.store(
        verified.credential.applicationId,
        parsed.data,
        policy.retentionDays,
      );
      if (result.ok === false) {
        return c.json(
          { message: "El ID de traza ya se usó con otros datos.", code: "traceConflict" },
          409,
        );
      }

      return c.json({ traceId: result.traceId, receivedAt: result.receivedAt }, 201);
    },
  );

  return app;
}
