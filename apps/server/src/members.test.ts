import { describe, expect, it, vi } from "vitest";
import { createMembersApp, type MembersDependencies } from "./members";

type MembersOverrides = Partial<MembersDependencies["members"]> & {
  getSession?: MembersDependencies["getSession"];
};

function createMembersDependencies({
  getSession,
  ...members
}: MembersOverrides = {}): MembersDependencies {
  return {
    getSession: getSession ?? (async () => null),
    members: {
      getMembership: async () => undefined,
      listOthers: async () => [],
      remove: async () => ({ ok: false, reason: "not-found" }),
      ...members,
    },
  };
}

describe("GET /organizations/:organizationId/members", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const app = createMembersApp(createMembersDependencies());

    const response = await app.request("/organizations/org-1/members", {
      method: "GET",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Authentication required",
    });
  });

  it("rejects non-members with 403 without revealing workspace members", async () => {
    const app = createMembersApp(
      createMembersDependencies({
        getSession: async () => ({ user: { id: "user-outside" } }),
        getMembership: async () => undefined,
        listOthers: async () => {
          throw new Error("must not be queried for non-members");
        },
      }),
    );

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

    const app = createMembersApp(
      createMembersDependencies({
        getSession: async () => ({ user: { id: "user-123" } }),
        getMembership: async (userId, organizationId) => {
          if (userId === "user-123" && organizationId === "org-1") return "member";
          return undefined;
        },
        listOthers: async (userId, organizationId) => {
          if (userId === "user-123" && organizationId === "org-1") return mockMembers;
          return [];
        },
      }),
    );

    const response = await app.request("/organizations/org-1/members", {
      method: "GET",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(mockMembers);
  });
});

describe("DELETE /organizations/:organizationId/members/:memberId", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const remove = vi.fn();
    const app = createMembersApp(createMembersDependencies({ remove }));

    const response = await app.request("/organizations/org-1/members/member-2", {
      method: "DELETE",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Authentication required",
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects non-members with 403 without touching the membership", async () => {
    const remove = vi.fn();
    const app = createMembersApp(
      createMembersDependencies({
        getSession: async () => ({ user: { id: "user-outside" } }),
        getMembership: async () => undefined,
        remove,
      }),
    );

    const response = await app.request("/organizations/org-1/members/member-2", {
      method: "DELETE",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes acceso a este workspace.",
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects non-admin members with 403 and the permission message", async () => {
    const remove = vi.fn();
    const app = createMembersApp(
      createMembersDependencies({
        getSession: async () => ({ user: { id: "user-123" } }),
        getMembership: async () => "member",
        remove,
      }),
    );

    const response = await app.request("/organizations/org-1/members/member-2", {
      method: "DELETE",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para retirar miembros de este workspace.",
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects the operation with 404 when the member does not belong to the workspace", async () => {
    const remove = vi.fn(async () => ({ ok: false as const, reason: "not-found" as const }));
    const app = createMembersApp(
      createMembersDependencies({
        getSession: async () => ({ user: { id: "user-123" } }),
        getMembership: async () => "admin",
        remove,
      }),
    );

    const response = await app.request("/organizations/org-1/members/member-unknown", {
      method: "DELETE",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos a este miembro en el workspace.",
    });
  });

  it("rejects removing the last administrator with 409", async () => {
    const remove = vi.fn(async () => ({ ok: false as const, reason: "last-admin" as const }));
    const app = createMembersApp(
      createMembersDependencies({
        getSession: async () => ({ user: { id: "user-123" } }),
        getMembership: async () => "owner",
        remove,
      }),
    );

    const response = await app.request("/organizations/org-1/members/member-1", {
      method: "DELETE",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "El workspace necesita al menos un administrador.",
    });
  });

  it("removes the membership for admins", async () => {
    const remove = vi.fn(async () => ({ ok: true as const }));
    const app = createMembersApp(
      createMembersDependencies({
        getSession: async () => ({ user: { id: "user-123" } }),
        getMembership: async () => "admin",
        remove,
      }),
    );

    const response = await app.request("/organizations/org-1/members/member-2", {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: "Miembro retirado." });
    expect(remove).toHaveBeenCalledWith("org-1", "member-2");
  });
});
