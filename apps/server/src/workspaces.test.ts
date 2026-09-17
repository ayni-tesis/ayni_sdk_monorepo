import { describe, expect, it } from "vitest";
import { createWorkspacesApp } from "./workspaces";

describe("GET /workspaces", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const app = createWorkspacesApp({
      getSession: async () => null,
      workspaces: {
        listByUser: async () => [],
      },
    });

    const response = await app.request("/workspaces", {
      method: "GET",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Authentication required",
    });
  });

  it("returns workspaces with roles for the authenticated user", async () => {
    const mockWorkspaces = [
      { id: "ws-1", name: "BioTec", slug: "biotec", role: "owner" },
      { id: "ws-2", name: "Coffee Lab", slug: "coffee-lab", role: "member" },
    ];

    const app = createWorkspacesApp({
      getSession: async () => ({ user: { id: "user-123" } }),
      workspaces: {
        listByUser: async (userId) => {
          if (userId === "user-123") return mockWorkspaces;
          return [];
        },
      },
    });

    const response = await app.request("/workspaces", {
      method: "GET",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(mockWorkspaces);
  });
});
