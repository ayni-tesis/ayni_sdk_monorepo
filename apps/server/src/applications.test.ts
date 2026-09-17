import { describe, expect, it } from "vitest";

import { createApp } from "./applications";

describe("POST /organizations/:organizationId/applications", () => {
  it("allows an administrator to create an application in their workspace", async () => {
    const app = createApp({
      getSession: async () => ({ user: { id: "admin" } }),
      applications: {
        getMembership: async () => "admin",
        create: async ({ organizationId, name }) => ({
          id: "app-1",
          organizationId,
          name,
          status: "active" as const,
        }),
        list: async () => [],
        get: async () => undefined,
        rename: async () => undefined,
        archive: async () => undefined,
      },
    });

    const response = await app.request("/organizations/org-1/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Cámara de campo" }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: "app-1",
      organizationId: "org-1",
      name: "Cámara de campo",
      status: "active",
    });
  });

  it("rejects an empty name without creating an application", async () => {
    const app = createApp({
      getSession: async () => ({ user: { id: "admin" } }),
      applications: {
        getMembership: async () => "admin",
        create: async () => {
          throw new Error("must not create");
        },
        list: async () => [],
        get: async () => undefined,
        rename: async () => undefined,
        archive: async () => undefined,
      },
    });

    const response = await app.request("/organizations/org-1/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "  " }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Ingresa un nombre para la aplicación.",
    });
  });
});

describe("GET /organizations/:organizationId/applications", () => {
  it("allows a member to list only the applications in their workspace", async () => {
    const app = createApp({
      getSession: async () => ({ user: { id: "member" } }),
      applications: {
        getMembership: async () => "member",
        create: async () => {
          throw new Error("not used");
        },
        list: async (organizationId) => [
          {
            id: "app-1",
            organizationId,
            name: "Cámara de campo",
            status: "active" as const,
          },
        ],
        get: async () => undefined,
        rename: async () => undefined,
        archive: async () => undefined,
      },
    });

    const response = await app.request("/organizations/org-1/applications");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        id: "app-1",
        organizationId: "org-1",
        name: "Cámara de campo",
        status: "active",
      },
    ]);
  });

  it("does not return archived applications in the active list", async () => {
    const app = createApp({
      getSession: async () => ({ user: { id: "member" } }),
      applications: {
        getMembership: async () => "member",
        create: async () => {
          throw new Error("not used");
        },
        list: async (organizationId) => [
          { id: "active", organizationId, name: "Activa", status: "active" as const },
          { id: "archived", organizationId, name: "Archivada", status: "archived" as const },
        ],
        get: async () => undefined,
        rename: async () => undefined,
        archive: async () => undefined,
      },
    });

    const response = await app.request("/organizations/org-1/applications");

    await expect(response.json()).resolves.toEqual([
      { id: "active", organizationId: "org-1", name: "Activa", status: "active" },
    ]);
  });
});

describe("GET /applications/:applicationId", () => {
  it("does not reveal an application from another workspace", async () => {
    const app = createApp({
      getSession: async () => ({ user: { id: "outsider" } }),
      applications: {
        getMembership: async () => undefined,
        create: async () => {
          throw new Error("not used");
        },
        list: async () => [],
        get: async () => ({
          id: "app-1",
          organizationId: "other-org",
          name: "Privada",
          status: "active" as const,
        }),
        rename: async () => undefined,
        archive: async () => undefined,
      },
    });

    const response = await app.request("/applications/app-1");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ message: "No encontramos esta aplicación." });
  });
});

describe("PATCH /applications/:applicationId", () => {
  it("allows an administrator to rename an application", async () => {
    const app = createApp({
      getSession: async () => ({ user: { id: "admin" } }),
      applications: {
        getMembership: async () => "admin",
        create: async () => {
          throw new Error("not used");
        },
        list: async () => [],
        get: async () => ({
          id: "app-1",
          organizationId: "org-1",
          name: "Antes",
          status: "active" as const,
        }),
        rename: async (id, name) => ({
          id,
          organizationId: "org-1",
          name,
          status: "active" as const,
        }),
        archive: async () => undefined,
      },
    });

    const response = await app.request("/applications/app-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Después" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "app-1",
      organizationId: "org-1",
      name: "Después",
      status: "active",
    });
  });
});

describe("POST /applications/:applicationId/archive", () => {
  it("allows an administrator to archive an active application", async () => {
    const app = createApp({
      getSession: async () => ({ user: { id: "admin" } }),
      applications: {
        getMembership: async () => "admin",
        create: async () => {
          throw new Error("not used");
        },
        list: async () => [],
        get: async () => ({
          id: "app-1",
          organizationId: "org-1",
          name: "Cámara",
          status: "active" as const,
        }),
        rename: async () => undefined,
        archive: async (id: string) => ({
          id,
          organizationId: "org-1",
          name: "Cámara",
          status: "archived" as const,
        }),
      },
    });

    const response = await app.request("/applications/app-1/archive", { method: "POST" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "app-1",
      organizationId: "org-1",
      name: "Cámara",
      status: "archived",
    });
  });
});
