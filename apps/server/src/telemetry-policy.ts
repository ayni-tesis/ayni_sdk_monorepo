import { isTelemetryRetentionDays } from "@ayni/api/telemetry-policy";
import { Hono } from "hono";
import { z } from "zod";

import type { Application } from "./applications";
import type {
  TelemetryPolicy,
  UpdateTelemetryPolicyInput,
  UpdateTelemetryPolicyResult,
} from "./telemetry-policy-store";

const NOT_FOUND_MESSAGE = "No encontramos esta aplicación.";
const INVALID_POLICY_MESSAGE = "La política de telemetría no es válida.";
const RETENTION_MESSAGE = "Selecciona un periodo de retención válido.";
const ENABLED_MESSAGE = "Indica si se permite la telemetría técnica.";
const EXTRA_FIELD_MESSAGE = "La política de telemetría solo define la habilitación y la retención.";

// Strict: the policy only enables telemetry and sets its retention, so any
// other field (such as one asking for images or raw inputs) is refused.
const telemetryPolicySchema = z.strictObject({
  enabled: z.boolean({ error: ENABLED_MESSAGE }),
  retentionDays: z.custom<UpdateTelemetryPolicyInput["retentionDays"]>(isTelemetryRetentionDays, {
    error: RETENTION_MESSAGE,
  }),
});

type Dependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  applications: {
    get: (id: string) => Promise<Application | undefined>;
    getMembership: (userId: string, organizationId: string) => Promise<string | undefined>;
  };
  telemetryPolicies: {
    get: (applicationId: string) => Promise<TelemetryPolicy>;
    update: (input: UpdateTelemetryPolicyInput) => Promise<UpdateTelemetryPolicyResult>;
  };
};

export function createTelemetryPolicyApp({
  getSession,
  applications,
  telemetryPolicies,
}: Dependencies) {
  const app = new Hono();

  app.get("/applications/:applicationId/telemetry-policy", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (
      !application ||
      !(await applications.getMembership(session.user.id, application.organizationId))
    ) {
      return c.json({ message: NOT_FOUND_MESSAGE }, 404);
    }

    return c.json({ policy: await telemetryPolicies.get(application.id) });
  });

  app.patch("/applications/:applicationId/telemetry-policy", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    // Checked before the body so a non-member never learns the application exists.
    const application = await applications.get(c.req.param("applicationId"));
    if (
      !application ||
      !(await applications.getMembership(session.user.id, application.organizationId))
    ) {
      return c.json({ message: NOT_FOUND_MESSAGE }, 404);
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ message: INVALID_POLICY_MESSAGE }, 400);
    }

    const parsed = telemetryPolicySchema.safeParse(rawBody);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const message =
        issue?.code === "unrecognized_keys"
          ? EXTRA_FIELD_MESSAGE
          : (issue?.message ?? INVALID_POLICY_MESSAGE);
      return c.json({ message }, 400);
    }

    const result = await telemetryPolicies.update({
      applicationId: application.id,
      userId: session.user.id,
      enabled: parsed.data.enabled,
      retentionDays: parsed.data.retentionDays,
    });

    if (result.ok === true) return c.json({ policy: result.policy });
    if (result.reason === "forbidden") {
      return c.json({ message: "No tienes permiso para cambiar la política de telemetría." }, 403);
    }
    if (result.reason === "archived") {
      return c.json(
        {
          message: "No puedes cambiar la política de telemetría de una aplicación archivada.",
          code: "applicationArchived",
        },
        409,
      );
    }

    return c.json({ message: NOT_FOUND_MESSAGE }, 404);
  });

  return app;
}
