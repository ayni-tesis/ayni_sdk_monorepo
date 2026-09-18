import { describe, expect, it } from "vitest";
import { createMembersApp } from "./members";

describe("GET /organizations/:organizationId/members", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const app = createMembersApp({
      getSession: async () => null,
      members: {
        getMembership: async () => undefined,
        listOthers: async () => [],
      },
    });

    const response = await app.request("/organizations/org-1/members", {
      method: "GET",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Authentication required",
    });
  });

  it("rejects non-members with 403 without revealing workspace members", async () => {
    const app = createMembersApp({
      getSession: async () => ({ user: { id: "user-outside" } }),
      members: {
        getMembership: async () => undefined,
        listOthers: async () => {
          throw new Error("must not be queried for non-members");
        },
      },
    });

    const response = await app.request("/organizations/org-1/members", {
      method: "GET",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes acceso a este workspace.",
    });
  });

  it("returns other members with name, email and role for workspace members", async () => {
    const mockMembers = [
      { id: "member-1", name: "Ana Rojas", email: "ana@biotec.io", role: "owner" },
      { id: "member-2", name: "Luis Pérez", email: "luis@biotec.io", role: "member" },
    ];

    const app = createMembersApp({
      getSession: async () => ({ user: { id: "user-123" } }),
      members: {
        getMembership: async (userId, organizationId) => {
          if (userId === "user-123" && organizationId === "org-1") return "member";
          return undefined;
        },
        listOthers: async (userId, organizationId) => {
          if (userId === "user-123" && organizationId === "org-1") return mockMembers;
          return [];
        },
      },
    });

    const response = await app.request("/organizations/org-1/members", {
      method: "GET",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(mockMembers);
  });
});

describe("PATCH /organizations/:organizationId/members/:memberId", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const app = createMembersApp({
      getSession: async () => null,
      members: {
        getMembership: async () => undefined,
        listOthers: async () => [],
        updateRole: async () => ({ success: false, error: "FORBIDDEN" }),
      },
    });

    const response = await app.request("/organizations/org-1/members/member-2", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Authentication required",
    });
  });

  it("rejects non-admin members with 403 and Spanish permission message", async () => {
    const app = createMembersApp({
      getSession: async () => ({ user: { id: "user-regular" } }),
      members: {
        getMembership: async (userId, orgId) => {
          if (userId === "user-regular" && orgId === "org-1") return "member";
          return undefined;
        },
        listOthers: async () => [],
        updateRole: async () => {
          throw new Error("must not be called for non-admin users");
        },
      },
    });

    const response = await app.request("/organizations/org-1/members/member-2", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para cambiar roles en este workspace.",
    });
  });

  it("rejects invalid role with 400", async () => {
    const app = createMembersApp({
      getSession: async () => ({ user: { id: "user-admin" } }),
      members: {
        getMembership: async () => "admin",
        listOthers: async () => [],
        updateRole: async () => ({ success: false, error: "FORBIDDEN" }),
      },
    });

    const response = await app.request("/organizations/org-1/members/member-2", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "superadmin" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Rol inválido.",
    });
  });

  it("rejects null or non-object body with 400", async () => {
    const app = createMembersApp({
      getSession: async () => ({ user: { id: "user-admin" } }),
      members: {
        getMembership: async () => "admin",
        listOthers: async () => [],
        updateRole: async () => ({ success: false, error: "FORBIDDEN" }),
      },
    });

    const response = await app.request("/organizations/org-1/members/member-2", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(null),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Rol inválido.",
    });
  });

  it("rejects with 403 when updateRole reports forbidden concurrent demotion", async () => {
    const app = createMembersApp({
      getSession: async () => ({ user: { id: "user-admin" } }),
      members: {
        getMembership: async () => "admin",
        listOthers: async () => [],
        updateRole: async () => ({ success: false, error: "FORBIDDEN" }),
      },
    });

    const response = await app.request("/organizations/org-1/members/member-2", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para cambiar roles en este workspace.",
    });
  });

  it("rejects modifying own role with 400", async () => {
    const app = createMembersApp({
      getSession: async () => ({ user: { id: "user-admin" } }),
      members: {
        getMembership: async () => "admin",
        listOthers: async () => [],
        updateRole: async () => ({
          success: false,
          error: "SELF_MODIFICATION_NOT_ALLOWED",
        }),
      },
    });

    const response = await app.request("/organizations/org-1/members/member-self", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "member" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "No puedes cambiar tu propio rol.",
    });
  });

  it("rejects modifying owner role with 400", async () => {
    const app = createMembersApp({
      getSession: async () => ({ user: { id: "user-admin" } }),
      members: {
        getMembership: async () => "admin",
        listOthers: async () => [],
        updateRole: async () => ({
          success: false,
          error: "CANNOT_MODIFY_OWNER",
        }),
      },
    });

    const response = await app.request("/organizations/org-1/members/member-owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "member" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "No se puede cambiar el rol del propietario.",
    });
  });

  it("rejects removing the last administrator with 400", async () => {
    const app = createMembersApp({
      getSession: async () => ({ user: { id: "user-admin" } }),
      members: {
        getMembership: async () => "admin",
        listOthers: async () => [],
        updateRole: async () => ({
          success: false,
          error: "AT_LEAST_ONE_ADMIN_REQUIRED",
        }),
      },
    });

    const response = await app.request("/organizations/org-1/members/member-admin-2", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "member" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "El workspace debe conservar al menos un administrador.",
    });
  });

  it("promotes a member to admin successfully", async () => {
    const updatedMember = {
      id: "member-2",
      name: "Luis Pérez",
      email: "luis@biotec.io",
      role: "admin",
    };

    let calledArgs: unknown = null;
    const app = createMembersApp({
      getSession: async () => ({ user: { id: "user-admin" } }),
      members: {
        getMembership: async () => "admin",
        listOthers: async () => [],
        updateRole: async (requesterUserId, orgId, memberId, newRole) => {
          calledArgs = { requesterUserId, orgId, memberId, newRole };
          return { success: true, member: updatedMember };
        },
      },
    });

    const response = await app.request("/organizations/org-1/members/member-2", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(updatedMember);
    expect(calledArgs).toEqual({
      requesterUserId: "user-admin",
      orgId: "org-1",
      memberId: "member-2",
      newRole: "admin",
    });
  });

  it("demotes an admin to member when another administrator exists", async () => {
    const updatedMember = {
      id: "member-2",
      name: "Luis Pérez",
      email: "luis@biotec.io",
      role: "member",
    };

    const app = createMembersApp({
      getSession: async () => ({ user: { id: "user-owner" } }),
      members: {
        getMembership: async () => "owner",
        listOthers: async () => [],
        updateRole: async () => ({ success: true, member: updatedMember }),
      },
    });

    const response = await app.request("/organizations/org-1/members/member-2", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "member" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(updatedMember);
  });
});
