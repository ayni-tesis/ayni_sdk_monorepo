import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";

type Dependencies = {
  /** `CRON_SECRET`, which Vercel Cron sends as `Authorization: Bearer <secret>`. */
  cronSecret: string | undefined;
  traces: { purgeExpired: () => Promise<{ deletedTraces: number }> };
};

function presentsSecret(authorization: string | undefined, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * The daily telemetry retention task (US-112), run by Vercel Cron as declared
 * in `vercel.json`. It deletes the traces whose retention period has passed.
 */
export function createTelemetryRetentionApp({ cronSecret, traces }: Dependencies) {
  const app = new Hono();

  app.get("/cron/telemetry-retention", async (c) => {
    if (!cronSecret || !presentsSecret(c.req.header("Authorization"), cronSecret)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    return c.json(await traces.purgeExpired());
  });

  return app;
}
