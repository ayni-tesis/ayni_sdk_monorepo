import { describe, expect, it, vi } from "vitest";

import { createTelemetryRetentionApp } from "./telemetry-retention";

const SECRET = "cron-secret-with-enough-length";

function makeApp(cronSecret: string | undefined = SECRET) {
  const purgeExpired = vi.fn(async () => ({ deletedTraces: 3 }));
  return {
    purgeExpired,
    app: createTelemetryRetentionApp({ cronSecret, traces: { purgeExpired } }),
  };
}

function run(app: ReturnType<typeof makeApp>["app"], authorization?: string) {
  return app.request("/cron/telemetry-retention", {
    headers: authorization ? { Authorization: authorization } : {},
  });
}

describe("GET /cron/telemetry-retention (US-112)", () => {
  it("deletes the expired traces when the scheduler presents the secret", async () => {
    const { app, purgeExpired } = makeApp();

    const response = await run(app, `Bearer ${SECRET}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deletedTraces: 3 });
    expect(purgeExpired).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no Authorization header", undefined],
    ["another secret", "Bearer another-secret-of-same-size!!"],
    ["the secret without the Bearer prefix", SECRET],
    ["a shorter secret", "Bearer cron"],
  ])("refuses a request with %s without deleting anything", async (_case, authorization) => {
    const { app, purgeExpired } = makeApp();

    const response = await run(app, authorization);

    expect(response.status).toBe(401);
    expect(purgeExpired).not.toHaveBeenCalled();
  });

  it("refuses every request while no secret is configured", async () => {
    const { app, purgeExpired } = makeApp(undefined);

    const response = await run(app, "Bearer undefined");

    expect(response.status).toBe(401);
    expect(purgeExpired).not.toHaveBeenCalled();
  });
});
