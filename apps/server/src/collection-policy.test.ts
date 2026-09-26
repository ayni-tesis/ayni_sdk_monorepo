import { describe, expect, it, vi } from "vitest";

import type { Application } from "./applications";
import { createCollectionPolicyApp } from "./collection-policy";
import type {
  CollectionPolicy,
  UpdateCollectionPolicyInput,
  UpdateCollectionPolicyResult,
} from "./collection-policy-store";

const activeApplication: Application = {
  id: "app-1",
  organizationId: "org-1",
  name: "Cámara",
  status: "active",
};

const savedPolicy: CollectionPolicy = {
  applicationId: "app-1",
  enabled: false,
  consentRequired: false,
  network: "wifi",
  maxImageSize: 1024,
  imageQuality: 80,
  updatedAt: null,
};

const validPolicy = {
  enabled: true,
  consentRequired: true,
  network: "wifiAndCellular",
  maxImageSize: 640,
  imageQuality: 75,
};

function makeApp({
  session = { user: { id: "admin" } },
  application = activeApplication,
  membershipRole = "admin",
  update = async ({ applicationId, userId: _userId, ...settings }: UpdateCollectionPolicyInput) =>
    ({
      ok: true,
      policy: { applicationId, ...settings, updatedAt: "2026-09-26T12:00:00.000Z" },
    }) as UpdateCollectionPolicyResult,
}: {
  session?: { user: { id: string } } | null;
  application?: Application | null;
  membershipRole?: string | null;
  update?: (input: UpdateCollectionPolicyInput) => Promise<UpdateCollectionPolicyResult>;
} = {}) {
  const getMock = vi.fn(async () => savedPolicy);
  const updateMock = vi.fn(update);
  return {
    get: getMock,
    update: updateMock,
    request: createCollectionPolicyApp({
      getSession: async () => session,
      applications: {
        get: async () => application ?? undefined,
        getMembership: async () => membershipRole ?? undefined,
      },
      collectionPolicies: { get: getMock, update: updateMock },
    }),
  };
}

function patchPolicy(request: ReturnType<typeof makeApp>["request"], body: unknown) {
  return request.request("/applications/app-1/collection-policy", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("GET /applications/:applicationId/collection-policy", () => {
  it("returns the policy to any workspace member", async () => {
    const { request, get } = makeApp({ membershipRole: "member" });

    const response = await request.request("/applications/app-1/collection-policy");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ policy: savedPolicy });
    expect(get).toHaveBeenCalledWith("app-1");
  });

  it("requires authentication", async () => {
    const { request, get } = makeApp({ session: null });

    const response = await request.request("/applications/app-1/collection-policy");

    expect(response.status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });

  it("answers a non-member the same 404 as a missing application", async () => {
    const hidden = makeApp({ membershipRole: null });
    const missing = makeApp({ application: null });

    const hiddenResponse = await hidden.request.request("/applications/app-1/collection-policy");
    const missingResponse = await missing.request.request("/applications/app-1/collection-policy");

    expect(hiddenResponse.status).toBe(404);
    expect(missingResponse.status).toBe(404);
    await expect(hiddenResponse.json()).resolves.toEqual(await missingResponse.json());
    expect(hidden.get).not.toHaveBeenCalled();
  });
});

describe("PATCH /applications/:applicationId/collection-policy", () => {
  it("enables collection for an administrator with consent, quality and network", async () => {
    const { request, update } = makeApp();

    const response = await patchPolicy(request, validPolicy);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      policy: { applicationId: "app-1", ...validPolicy, updatedAt: "2026-09-26T12:00:00.000Z" },
    });
    expect(update).toHaveBeenCalledWith({
      applicationId: "app-1",
      userId: "admin",
      ...validPolicy,
    });
  });

  it("rejects enabling collection without a consent configuration and writes nothing", async () => {
    const { request, update } = makeApp();

    const response = await patchPolicy(request, { ...validPolicy, consentRequired: false });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "La recolección exige una configuración explícita de consentimiento.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("saves a disabled policy without consent", async () => {
    const { request, update } = makeApp();

    const response = await patchPolicy(request, {
      ...validPolicy,
      enabled: false,
      consentRequired: false,
    });

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, consentRequired: false }),
    );
  });

  it("rejects a plain member and keeps the previous policy", async () => {
    const { request, update } = makeApp({
      membershipRole: "member",
      update: async () => ({ ok: false, reason: "forbidden" }),
    });

    const response = await patchPolicy(request, validPolicy);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para cambiar la política de recolección.",
    });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("rejects an archived application with applicationArchived", async () => {
    const { request } = makeApp({ update: async () => ({ ok: false, reason: "archived" }) });

    const response = await patchPolicy(request, validPolicy);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "applicationArchived",
      message: "No puedes cambiar la política de recolección de una aplicación archivada.",
    });
  });

  it("answers the same 404 when the store does not find the application for the user", async () => {
    const { request } = makeApp({ update: async () => ({ ok: false, reason: "notFound" }) });

    const response = await patchPolicy(request, validPolicy);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ message: "No encontramos esta aplicación." });
  });

  it("answers a non-member 404 even for an invalid body, so the application stays hidden", async () => {
    const { request, update } = makeApp({ membershipRole: null });

    const response = await patchPolicy(request, "{");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ message: "No encontramos esta aplicación." });
    expect(update).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing application without writing", async () => {
    const { request, update } = makeApp({ application: null });

    const response = await patchPolicy(request, validPolicy);

    expect(response.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    const { request, update } = makeApp({ session: null });

    const response = await patchPolicy(request, validPolicy);

    expect(response.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  const SIZE_MESSAGE = "El tamaño máximo debe ser un número entero entre 128 y 4096 píxeles.";
  const QUALITY_MESSAGE = "La calidad debe ser un número entero entre 10 y 100.";

  it.each([
    [
      { ...validPolicy, enabled: "yes" },
      "Indica si se permite la captura de imágenes para datasets.",
    ],
    [
      { ...validPolicy, consentRequired: undefined },
      "Indica si la recolección exige consentimiento.",
    ],
    [{ ...validPolicy, network: "cellular" }, "Selecciona una red permitida válida."],
    [{ ...validPolicy, maxImageSize: 64 }, SIZE_MESSAGE],
    [{ ...validPolicy, maxImageSize: 5000 }, SIZE_MESSAGE],
    [{ ...validPolicy, maxImageSize: 640.5 }, SIZE_MESSAGE],
    [{ ...validPolicy, maxImageSize: "640" }, SIZE_MESSAGE],
    [{ ...validPolicy, imageQuality: 5 }, QUALITY_MESSAGE],
    [{ ...validPolicy, imageQuality: 101 }, QUALITY_MESSAGE],
    [{ ...validPolicy, imageQuality: null }, QUALITY_MESSAGE],
    ["{", "La política de recolección no es válida."],
  ])("rejects the invalid policy %j without writing", async (body, message) => {
    const { request, update } = makeApp();

    const response = await patchPolicy(request, body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message });
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses any extra field", async () => {
    const { request, update } = makeApp();

    const response = await patchPolicy(request, { ...validPolicy, collectRawInputs: true });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message:
        "La política de recolección solo define la habilitación, el consentimiento, la red permitida, el tamaño máximo y la calidad.",
    });
    expect(update).not.toHaveBeenCalled();
  });
});
