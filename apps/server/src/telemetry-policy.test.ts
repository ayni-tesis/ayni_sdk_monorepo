import { describe, expect, it, vi } from "vitest";

import type { Application } from "./applications";
import { createTelemetryPolicyApp } from "./telemetry-policy";
import type {
  TelemetryPolicy,
  UpdateTelemetryPolicyInput,
  UpdateTelemetryPolicyResult,
} from "./telemetry-policy-store";

const activeApplication: Application = {
  id: "app-1",
  organizationId: "org-1",
  name: "Cámara",
  status: "active",
};

const savedPolicy: TelemetryPolicy = {
  applicationId: "app-1",
  enabled: false,
  retentionDays: 30,
  updatedAt: null,
};

function makeApp({
  session = { user: { id: "admin" } },
  application = activeApplication,
  membershipRole = "admin",
  update = async ({ applicationId, enabled, retentionDays }: UpdateTelemetryPolicyInput) =>
    ({
      ok: true,
      policy: { applicationId, enabled, retentionDays, updatedAt: "2026-09-26T12:00:00.000Z" },
    }) as UpdateTelemetryPolicyResult,
}: {
  session?: { user: { id: string } } | null;
  application?: Application | null;
  membershipRole?: string | null;
  update?: (input: UpdateTelemetryPolicyInput) => Promise<UpdateTelemetryPolicyResult>;
} = {}) {
  const getMock = vi.fn(async () => savedPolicy);
  const updateMock = vi.fn(update);
  return {
    get: getMock,
    update: updateMock,
    request: createTelemetryPolicyApp({
      getSession: async () => session,
      applications: {
        get: async () => application ?? undefined,
        getMembership: async () => membershipRole ?? undefined,
      },
      telemetryPolicies: { get: getMock, update: updateMock },
    }),
  };
}

function patchPolicy(request: ReturnType<typeof makeApp>["request"], body: unknown) {
  return request.request("/applications/app-1/telemetry-policy", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("GET /applications/:applicationId/telemetry-policy", () => {
  it("returns the policy to any workspace member", async () => {
    const { request, get } = makeApp({ membershipRole: "member" });

    const response = await request.request("/applications/app-1/telemetry-policy");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ policy: savedPolicy });
    expect(get).toHaveBeenCalledWith("app-1");
  });

  it("requires authentication", async () => {
    const { request, get } = makeApp({ session: null });

    const response = await request.request("/applications/app-1/telemetry-policy");

    expect(response.status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });

  it("answers a non-member the same 404 as a missing application", async () => {
    const hidden = makeApp({ membershipRole: null });
    const missing = makeApp({ application: null });

    const hiddenResponse = await hidden.request.request("/applications/app-1/telemetry-policy");
    const missingResponse = await missing.request.request("/applications/app-1/telemetry-policy");

    expect(hiddenResponse.status).toBe(404);
    expect(missingResponse.status).toBe(404);
    await expect(hiddenResponse.json()).resolves.toEqual(await missingResponse.json());
    expect(hidden.get).not.toHaveBeenCalled();
  });
});

describe("PATCH /applications/:applicationId/telemetry-policy", () => {
  it("lets an administrator of an active application enable telemetry", async () => {
    const { request, update } = makeApp();

    const response = await patchPolicy(request, { enabled: true, retentionDays: 90 });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      policy: {
        applicationId: "app-1",
        enabled: true,
        retentionDays: 90,
        updatedAt: "2026-09-26T12:00:00.000Z",
      },
    });
    expect(update).toHaveBeenCalledWith({
      applicationId: "app-1",
      userId: "admin",
      enabled: true,
      retentionDays: 90,
    });
  });

  it("rejects a plain member and keeps the previous policy", async () => {
    const { request, update } = makeApp({
      membershipRole: "member",
      update: async () => ({ ok: false, reason: "forbidden" }),
    });

    const response = await patchPolicy(request, { enabled: true, retentionDays: 30 });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para cambiar la política de telemetría.",
    });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("rejects an archived application with applicationArchived", async () => {
    const { request } = makeApp({ update: async () => ({ ok: false, reason: "archived" }) });

    const response = await patchPolicy(request, { enabled: true, retentionDays: 30 });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "applicationArchived",
      message: "No puedes cambiar la política de telemetría de una aplicación archivada.",
    });
  });

  it("answers the same 404 when the store does not find the application for the user", async () => {
    const { request } = makeApp({ update: async () => ({ ok: false, reason: "notFound" }) });

    const response = await patchPolicy(request, { enabled: true, retentionDays: 30 });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ message: "No encontramos esta aplicación." });
  });

  it("returns 404 for a missing application without writing", async () => {
    const { request, update } = makeApp({ application: null });

    const response = await patchPolicy(request, { enabled: true, retentionDays: 30 });

    expect(response.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    const { request, update } = makeApp({ session: null });

    const response = await patchPolicy(request, { enabled: true, retentionDays: 30 });

    expect(response.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    [{ enabled: true, retentionDays: 45 }, "Selecciona un periodo de retención válido."],
    [{ enabled: true, retentionDays: "30" }, "Selecciona un periodo de retención válido."],
    [{ enabled: true }, "Selecciona un periodo de retención válido."],
    [{ enabled: "yes", retentionDays: 30 }, "Indica si se permite la telemetría técnica."],
    [{ retentionDays: 30 }, "Indica si se permite la telemetría técnica."],
    ["{", "La política de telemetría no es válida."],
  ])("rejects the invalid policy %j without writing", async (body, message) => {
    const { request, update } = makeApp();

    const response = await patchPolicy(request, body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message });
    expect(update).not.toHaveBeenCalled();
  });

  it("never lets the policy authorize collecting images or raw inputs", async () => {
    const { request, update } = makeApp();

    const response = await patchPolicy(request, {
      enabled: true,
      retentionDays: 30,
      collectImages: true,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "La telemetría no incluye imágenes ni entradas crudas.",
    });
    expect(update).not.toHaveBeenCalled();
  });
});
