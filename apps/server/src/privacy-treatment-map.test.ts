import { describe, expect, it, vi } from "vitest";
import type { Application } from "./applications";
import { createPrivacyTreatmentMapApp } from "./privacy-treatment-map";
import type {
  PrivacyTreatmentMap,
  UpdatePrivacyTreatmentMapInput,
  UpdatePrivacyTreatmentMapResult,
} from "./privacy-treatment-map-store";

const activeApplication: Application = {
  id: "app-1",
  organizationId: "org-1",
  name: "Cámara",
  status: "active",
};

const savedMap: PrivacyTreatmentMap = {
  applicationId: "app-1",
  treatments: [],
  readyToPublish: false,
  updatedAt: null,
};

const validTreatment = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  purpose: "Telemetría técnica",
  dataCategories: ["Versión del SDK"],
  dataContext: "ayniPlatform",
  source: "Dispositivo",
  requirement: "optional",
  legalBasis: "Por confirmar",
  legalBasisConfirmed: true,
  role: "processor",
  recipients: ["Ninguno"],
  transfers: "No aplica",
  retention: "30 días",
  rightsChannel: "privacidad@example.test",
} as const;

function makeApp({
  session = { user: { id: "admin" } },
  application = activeApplication,
  membershipRole = "admin",
  update = async ({ applicationId, treatments }: UpdatePrivacyTreatmentMapInput) =>
    ({
      ok: true,
      map: {
        applicationId,
        treatments,
        readyToPublish: true,
        updatedAt: "2026-09-30T12:00:00.000Z",
      },
    }) as UpdatePrivacyTreatmentMapResult,
}: {
  session?: { user: { id: string } } | null;
  application?: Application | null;
  membershipRole?: string | null;
  update?: (input: UpdatePrivacyTreatmentMapInput) => Promise<UpdatePrivacyTreatmentMapResult>;
} = {}) {
  const get = vi.fn(async () => savedMap);
  const updateMock = vi.fn(update);
  return {
    get,
    update: updateMock,
    request: createPrivacyTreatmentMapApp({
      getSession: async () => session,
      applications: {
        get: async () => application ?? undefined,
        getMembership: async () => membershipRole ?? undefined,
      },
      privacyMaps: { get, update: updateMock },
    }),
  };
}

function putMap(request: ReturnType<typeof makeApp>["request"], body: unknown) {
  return request.request("/applications/app-1/privacy-treatment-map", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("GET /applications/:applicationId/privacy-treatment-map", () => {
  it("returns the map to workspace members", async () => {
    const { request, get } = makeApp({ membershipRole: "member" });
    const response = await request.request("/applications/app-1/privacy-treatment-map");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ map: savedMap });
    expect(get).toHaveBeenCalledWith("app-1");
  });

  it("requires a session", async () => {
    const { request, get } = makeApp({ session: null });
    const response = await request.request("/applications/app-1/privacy-treatment-map");

    expect(response.status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });

  it("hides an application from non-members", async () => {
    const { request, get } = makeApp({ membershipRole: null });
    const response = await request.request("/applications/app-1/privacy-treatment-map");

    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });
});

describe("PUT /applications/:applicationId/privacy-treatment-map", () => {
  it("saves a treatment for an administrator", async () => {
    const { request, update } = makeApp();
    const response = await putMap(request, { treatments: [validTreatment] });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      map: {
        applicationId: "app-1",
        treatments: [validTreatment],
        readyToPublish: true,
        updatedAt: "2026-09-30T12:00:00.000Z",
      },
    });
    expect(update).toHaveBeenCalledWith({
      applicationId: "app-1",
      userId: "admin",
      treatments: [validTreatment],
    });
  });

  it("rejects unknown fields before writing", async () => {
    const { request, update } = makeApp();
    const response = await putMap(request, { treatments: [], unexpected: true });

    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an invalid treatment and a duplicate id", async () => {
    const { request, update } = makeApp();
    const invalid = await putMap(request, { treatments: [{ ...validTreatment, role: "other" }] });
    const duplicate = await putMap(request, { treatments: [validTreatment, validTreatment] });

    expect(invalid.status).toBe(400);
    expect(duplicate.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("does not parse or write for a non-member", async () => {
    const { request, update } = makeApp({ membershipRole: null });
    const response = await putMap(request, "not json");

    expect(response.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns forbidden for members and archived for archived applications", async () => {
    const memberApp = makeApp({
      membershipRole: "member",
      update: async () => ({ ok: false, reason: "forbidden" }),
    });
    const archivedApp = makeApp({
      update: async () => ({ ok: false, reason: "archived" }),
    });

    expect((await putMap(memberApp.request, { treatments: [] })).status).toBe(403);
    expect((await putMap(archivedApp.request, { treatments: [] })).status).toBe(409);
  });
});
