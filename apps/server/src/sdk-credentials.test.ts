import { describe, expect, it, vi } from "vitest";

import type { Application } from "./applications";
import {
  type CreatedSdkCredential,
  createSdkCredentialsApp,
  generateSdkCredentialSecret,
  hashSdkCredentialSecret,
} from "./sdk-credentials";

const activeApplication: Application = {
  id: "app-1",
  organizationId: "org-1",
  name: "Cámara",
  status: "active",
};

function makeApp({
  session = { user: { id: "admin" } },
  application = activeApplication,
  membership = "admin",
  create = vi.fn(
    async ({ applicationId }: { applicationId: string }): Promise<CreatedSdkCredential> => ({
      id: "cred-1",
      applicationId,
      secret: "ayni_sk_abcd1234rest-of-secret",
    }),
  ),
}: {
  session?: { user: { id: string } } | null;
  application?: Application | null;
  membership?: string | null;
  create?: (input: { applicationId: string }) => Promise<CreatedSdkCredential | undefined>;
} = {}) {
  return {
    create,
    request: createSdkCredentialsApp({
      getSession: async () => session,
      applications: {
        get: async () => application ?? undefined,
        getMembership: async () => membership ?? undefined,
      },
      credentials: { create },
    }),
  };
}

describe("POST /applications/:applicationId/sdk-credentials", () => {
  it("allows an administrator to generate a credential for an active application", async () => {
    const { request, create } = makeApp();

    const response = await request.request("/applications/app-1/sdk-credentials", {
      method: "POST",
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      credential: {
        id: "cred-1",
        applicationId: "app-1",
        secret: "ayni_sk_abcd1234rest-of-secret",
      },
    });
    expect(create).toHaveBeenCalledWith({ applicationId: "app-1" });
  });

  it("requires an authenticated session", async () => {
    const { request, create } = makeApp({ session: null });

    const response = await request.request("/applications/app-1/sdk-credentials", {
      method: "POST",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Authentication required" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a member without administration permissions without creating a credential", async () => {
    const { request, create } = makeApp({ membership: "member" });

    const response = await request.request("/applications/app-1/sdk-credentials", {
      method: "POST",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para administrar credenciales.",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a user outside the workspace without creating a credential", async () => {
    const { request, create } = makeApp({ membership: null });

    const response = await request.request("/applications/app-1/sdk-credentials", {
      method: "POST",
    });

    expect(response.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an archived application with the applicationArchived state", async () => {
    const { request, create } = makeApp({
      application: { ...activeApplication, status: "archived" },
    });

    const response = await request.request("/applications/app-1/sdk-credentials", {
      method: "POST",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "No puedes generar credenciales para una aplicación archivada.",
      code: "applicationArchived",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects with applicationArchived when the application is archived mid-request", async () => {
    const { request, create } = makeApp({ create: vi.fn(async () => undefined) });

    const response = await request.request("/applications/app-1/sdk-credentials", {
      method: "POST",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "No puedes generar credenciales para una aplicación archivada.",
      code: "applicationArchived",
    });
    expect(create).toHaveBeenCalledWith({ applicationId: "app-1" });
  });

  it("returns not found when the application does not exist", async () => {
    const { request, create } = makeApp({ application: null });

    const response = await request.request("/applications/missing/sdk-credentials", {
      method: "POST",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos esta aplicación.",
    });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("SDK credential secrets", () => {
  it("generates unique secrets with the SDK credential prefix", () => {
    const first = generateSdkCredentialSecret();
    const second = generateSdkCredentialSecret();

    expect(first.startsWith("ayni_sk_")).toBe(true);
    expect(second.startsWith("ayni_sk_")).toBe(true);
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThan(32);
  });

  it("hashes the secret deterministically without storing it in plain text", () => {
    const secret = generateSdkCredentialSecret();
    const hash = hashSdkCredentialSecret(secret);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashSdkCredentialSecret(secret));
    expect(hash).not.toBe(secret);
    expect(hash).not.toBe(hashSdkCredentialSecret(generateSdkCredentialSecret()));
  });
});
