import { describe, expect, it } from "vitest";
import { createMembersApp } from "./members";

describe("GET /organizations/:organizationId/members", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const app = createMembersApp({
      getSession: async () => null,
      members: {
        getMembership: async () => undefined,
        list: async () => [],
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
        list: async () => {
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

  it("returns members with name, email and role for workspace members", async () => {
    const mockMembers = [
      { id: "member-1", name: "Diego Salas", email: "diego@biotec.io", role: "owner" },
      { id: "member-2", name: "Ana Rojas", email: "ana@biotec.io", role: "member" },
    ];

    const app = createMembersApp({
      getSession: async () => ({ user: { id: "user-123" } }),
      members: {
        getMembership: async (userId, organizationId) => {
          if (userId === "user-123" && organizationId === "org-1") return "member";
          return undefined;
        },
        list: async (organizationId) => {
          if (organizationId === "org-1") return mockMembers;
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
