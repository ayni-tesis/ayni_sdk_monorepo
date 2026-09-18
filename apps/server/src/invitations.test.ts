import { describe, expect, it } from "vitest";
import { createInvitationsApp, type InvitationsDependencies } from "./invitations";

const ADMIN = { user: { id: "admin-1" } };

function forbidden(name: string) {
  return async (): Promise<never> => {
    throw new Error(`${name} must not be called`);
  };
}

function buildApp(
  options: {
    session?: { user: { id: string } } | null;
    invitations?: Partial<InvitationsDependencies["invitations"]>;
  } = {},
) {
  const invitations: InvitationsDependencies["invitations"] = {
    getMembership: async () => "admin",
    create: async ({ organizationId, role, createdById }) => ({
      id: "inv-1",
      token: "tok-123",
      organizationId,
      role,
      inviterId: createdById,
      expiresAt: "2026-10-01T00:00:00.000Z",
    }),
    getByToken: async (token) =>
      token === "tok-123"
        ? {
            id: "inv-1",
            organizationId: "org-1",
            organizationName: "Laboratorio Andino",
            role: "member",
            expiresAt: "2026-10-01T00:00:00.000Z",
          }
        : undefined,
    accept: async (token, userId) =>
      token === "tok-123" && userId === "user-9"
        ? {
            id: "inv-1",
            organizationId: "org-1",
            organizationName: "Laboratorio Andino",
            role: "member",
          }
        : undefined,
    ...options.invitations,
  };

  const app = createInvitationsApp({
    getSession: async () => (options.session === undefined ? ADMIN : options.session),
    invitations,
  });
  return { app };
}

describe("POST /organizations/:organizationId/invitation-links", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const { app } = buildApp({
      session: null,
      invitations: { create: forbidden("create") },
    });

    const response = await app.request("/organizations/org-1/invitation-links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "member" }),
    });

    expect(response.status).toBe(401);
  });

  it("rejects members without admin permissions and does not create the invitation", async () => {
    const { app } = buildApp({
      session: { user: { id: "plain-user" } },
      invitations: { getMembership: async () => "member", create: forbidden("create") },
    });

    const response = await app.request("/organizations/org-1/invitation-links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "member" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para crear invitaciones en este workspace.",
    });
  });

  it("allows owners to create invitation links", async () => {
    const { app } = buildApp({
      session: { user: { id: "owner-1" } },
      invitations: { getMembership: async () => "owner" },
    });

    const response = await app.request("/organizations/org-1/invitation-links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      invitation: {
        id: "inv-1",
        token: "tok-123",
        organizationId: "org-1",
        role: "admin",
        expiresAt: "2026-10-01T00:00:00.000Z",
      },
    });
  });

  it("rejects roles outside the supported workspace roles", async () => {
    const { app } = buildApp({ invitations: { create: forbidden("create") } });

    const response = await app.request("/organizations/org-1/invitation-links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "owner" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Selecciona un rol válido para la invitación.",
    });
  });

  it("rejects malformed request bodies", async () => {
    const { app } = buildApp({ invitations: { create: forbidden("create") } });

    const response = await app.request("/organizations/org-1/invitation-links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Selecciona un rol válido para la invitación.",
    });
  });
});

describe("GET /invitation-links/:token", () => {
  it("returns the workspace and role a valid invitation link refers to", async () => {
    const { app } = buildApp();

    const response = await app.request("/invitation-links/tok-123");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      invitation: {
        id: "inv-1",
        organizationId: "org-1",
        organizationName: "Laboratorio Andino",
        role: "member",
        expiresAt: "2026-10-01T00:00:00.000Z",
      },
    });
  });

  it("returns 404 for unknown, used or expired tokens", async () => {
    const { app } = buildApp();

    const response = await app.request("/invitation-links/does-not-exist");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "Este enlace de invitación no es válido.",
    });
  });
});

describe("POST /invitation-links/:token/accept", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const { app } = buildApp({
      session: null,
      invitations: { accept: forbidden("accept") },
    });

    const response = await app.request("/invitation-links/tok-123/accept", { method: "POST" });

    expect(response.status).toBe(401);
  });

  it("adds the signed-in user to the invited workspace only", async () => {
    let acceptedWith: { token: string; userId: string } | undefined;
    const { app } = buildApp({
      session: { user: { id: "user-9" } },
      invitations: {
        accept: async (token, userId) => {
          acceptedWith = { token, userId };
          return {
            id: "inv-1",
            organizationId: "org-1",
            organizationName: "Laboratorio Andino",
            role: "member",
          };
        },
      },
    });

    const response = await app.request("/invitation-links/tok-123/accept", { method: "POST" });

    expect(response.status).toBe(200);
    expect(acceptedWith).toEqual({ token: "tok-123", userId: "user-9" });
    await expect(response.json()).resolves.toEqual({
      organization: { id: "org-1", name: "Laboratorio Andino", role: "member" },
    });
  });

  it("returns 404 when the invitation token cannot be accepted", async () => {
    const { app } = buildApp({
      session: { user: { id: "user-9" } },
      invitations: { accept: async () => undefined },
    });

    const response = await app.request("/invitation-links/expired-tok/accept", {
      method: "POST",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "Este enlace de invitación no es válido.",
    });
  });

  it("returns 409 when the user is already a member of the invited workspace", async () => {
    const { app } = buildApp({
      session: { user: { id: "user-9" } },
      invitations: { accept: async () => "already-member" },
    });

    const response = await app.request("/invitation-links/tok-123/accept", { method: "POST" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "Ya eres miembro de este workspace.",
    });
  });
});
