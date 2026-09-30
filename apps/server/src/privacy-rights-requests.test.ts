import type { PrivacyTreatment } from "@ayni/api/privacy-treatment";
import { describe, expect, it, vi } from "vitest";
import type { ApplicationDatabase } from "./application-actions";
import type { Application } from "./applications";
import type {
  PrivacyRightsRequest,
  PublicPrivacyRightsRequest,
} from "./privacy-rights-request-store";
import { createPrivacyRightsRequestsApp } from "./privacy-rights-requests";
import type { PublishedPrivacyNotice } from "./privacy-treatment-map-store";

const treatment: PrivacyTreatment = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  purpose: "Atender solicitudes de derechos",
  dataCategories: ["Correo electrónico"],
  dataContext: "clientApplication",
  source: "Persona usuaria",
  requirement: "required",
  legalBasis: "Declarada por la aplicación",
  legalBasisConfirmed: true,
  role: "controller",
  roleEntity: "Responsable de la aplicación",
  policyLinks: [],
  recipients: ["Ninguno"],
  transfers: "No declaradas",
  retention: "Por definir",
  rightsChannel: "derechos@example.test",
};
const notice: PublishedPrivacyNotice = {
  applicationId: "app-1",
  version: 3,
  publishedAt: "2026-09-30T12:00:00.000Z",
  treatments: [treatment],
};
const saved: PrivacyRightsRequest = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  applicationId: "app-1",
  noticeVersion: 3,
  treatmentId: treatment.id,
  purpose: treatment.purpose,
  responsibleEntity: treatment.roleEntity,
  rightsChannel: treatment.rightsChannel,
  type: "access",
  contactEmail: "person@example.test",
  details: "Quiero saber qué datos se tratan.",
  status: "received",
  response: "",
  reason: "",
  createdAt: "2026-09-30T12:00:00.000Z",
  updatedAt: "2026-09-30T12:00:00.000Z",
  updatedById: null,
};

function makeApp({
  session = null,
  role,
  published = notice,
}: {
  session?: { user: { id: string } } | null;
  role?: string;
  published?: PublishedPrivacyNotice | null;
} = {}) {
  const create = vi.fn(async () => ({
    id: saved.id,
    status: "received" as const,
    createdAt: saved.createdAt,
  }));
  const getPublic = vi.fn(
    async (): Promise<PublicPrivacyRightsRequest> => ({
      id: saved.id,
      type: "access",
      status: "received",
      response: "",
      reason: "",
      createdAt: saved.createdAt,
    }),
  );
  const list = vi.fn(async () => ({ ok: true as const, requests: [saved] }));
  const update = vi.fn(async () => ({ ok: true as const, request: saved }));
  const rateLimit = vi.fn(async () => ({ success: true }));
  const app = createPrivacyRightsRequestsApp({
    getSession: async () => session,
    applications: {
      get: async (id): Promise<Application | undefined> =>
        id === "app-1"
          ? { id: "app-1", organizationId: "org-1", name: "Aplicación", status: "active" }
          : undefined,
      getMembership: async () => role,
    },
    privacyMaps: { getPublished: async () => published ?? undefined },
    requests: {
      create: create as never,
      getPublic: getPublic as never,
      list: list as never,
      update: update as never,
    },
    database: {} as ApplicationDatabase,
    rateLimit,
  });
  return { app, create, getPublic, list, update, rateLimit };
}

describe("application privacy rights requests", () => {
  it("records a minimal public request against the published responsible and version", async () => {
    const { app, create } = makeApp();
    const response = await app.request("/applications/app-1/privacy-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        treatmentId: treatment.id,
        type: "access",
        contactEmail: "person@example.test",
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      requestNumber: saved.id,
      status: "received",
      message:
        "Solicitud recibida. Guarda este número en un lugar privado para consultar su estado y respuesta.",
    });
    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        applicationId: "app-1",
        noticeVersion: 3,
        responsibleEntity: treatment.roleEntity,
        rightsChannel: treatment.rightsChannel,
      }),
    );
  });

  it("does not accept a request for an unpublished application notice", async () => {
    const { app, create } = makeApp({ published: null });
    const response = await app.request("/applications/app-1/privacy-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        treatmentId: treatment.id,
        type: "access",
        contactEmail: "person@example.test",
      }),
    });
    expect(response.status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });

  it("limits public submissions and status lookups", async () => {
    const { app, create, rateLimit } = makeApp();
    rateLimit.mockResolvedValue({ success: false });
    const submission = await app.request("/applications/app-1/privacy-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        treatmentId: treatment.id,
        type: "access",
        contactEmail: "person@example.test",
      }),
    });
    const lookup = await app.request(`/privacy-requests/${saved.id}`);
    expect(submission.status).toBe(429);
    expect(lookup.status).toBe(429);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns only status information to the holder of the opaque request number", async () => {
    const { app } = makeApp();
    const response = await app.request(`/privacy-requests/${saved.id}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { request: PublicPrivacyRightsRequest };
    expect(body.request).toEqual({
      id: saved.id,
      type: "access",
      status: "received",
      response: "",
      reason: "",
      createdAt: saved.createdAt,
    });
    expect(JSON.stringify(body)).not.toContain(saved.contactEmail);
    expect(JSON.stringify(body)).not.toContain(saved.details);
  });

  it("restricts application request lists to administrators and owners", async () => {
    const memberRequest = makeApp({ session: { user: { id: "member" } }, role: "member" });
    const denied = await memberRequest.app.request("/applications/app-1/privacy-requests");
    expect(denied.status).toBe(403);
    expect(memberRequest.list).not.toHaveBeenCalled();

    const adminRequest = makeApp({ session: { user: { id: "admin" } }, role: "admin" });
    const allowed = await adminRequest.app.request("/applications/app-1/privacy-requests");
    expect(allowed.status).toBe(200);
    expect(adminRequest.list).toHaveBeenCalledWith(expect.anything(), {
      applicationId: "app-1",
      userId: "admin",
      page: 1,
    });
  });

  it("requires an explanation before marking a request as not applicable", async () => {
    const { app, update } = makeApp({ session: { user: { id: "admin" } }, role: "owner" });
    const response = await app.request(`/applications/app-1/privacy-requests/${saved.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "notApplicable" }),
    });
    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
