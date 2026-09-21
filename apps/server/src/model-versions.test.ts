import { describe, expect, it, vi } from "vitest";

import type { Application } from "./applications";
import type { CreateModelVersionResult } from "./model-version-store";
import { createModelVersionsApp } from "./model-versions";

const activeApplication: Application = {
  id: "app-1",
  organizationId: "org-1",
  name: "Invernos",
  status: "active",
};

const archivedApplication: Application = { ...activeApplication, status: "archived" };

function validVersionResult(): CreateModelVersionResult {
  return {
    ok: true,
    modelVersion: {
      id: "mv-1",
      modelId: "model-1",
      version: "1.0.0",
      storageKey: "applications/app-1/models/model-1/versions/1.0.0.tflite",
      sha256: "a".repeat(64),
      sizeBytes: 20,
      createdAt: "2026-09-20T00:00:00.000Z",
      uploadedById: "admin",
    },
  };
}

function makeApp({
  session = { user: { id: "admin" } },
  application = activeApplication,
  create = async (): Promise<CreateModelVersionResult> => validVersionResult(),
}: {
  session?: { user: { id: string } } | null;
  application?: Application | null;
  create?: (input: {
    applicationId: string;
    modelId: string;
    userId: string;
    version: string;
    bytes: Uint8Array;
    maxBytes: number;
  }) => Promise<CreateModelVersionResult>;
} = {}) {
  const createMock = vi.fn(create);
  const app = createModelVersionsApp({
    getSession: async () => session,
    applications: {
      get: async () => application ?? undefined,
    },
    modelVersions: { create: createMock },
  });
  return { app, createMock };
}

function uploadRequest({
  version = "1.0.0",
  file,
}: {
  version?: string | null;
  file?: Blob | null;
} = {}) {
  const form = new FormData();
  if (version !== null) form.append("version", version);
  if (file) form.append("file", file);
  else form.append("file", new Blob([new Uint8Array(20)]), "modelo.tflite");
  return { method: "POST", body: form };
}

const MODEL_URL = "/applications/app-1/models/model-1/versions";

describe("POST /applications/:applicationId/models/:modelId/versions", () => {
  it("requires authentication", async () => {
    const { app, createMock } = makeApp({ session: null });
    const response = await app.request(MODEL_URL, uploadRequest());

    expect(response.status).toBe(401);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the application does not exist", async () => {
    const { app, createMock } = makeApp({ application: null });
    const response = await app.request(MODEL_URL, uploadRequest());

    expect(response.status).toBe(404);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("uploads the version and returns 201 with the stored record", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const { app, createMock } = makeApp();

    const response = await app.request(
      MODEL_URL,
      uploadRequest({ version: "1.0.0", file: new Blob([bytes]) }),
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { modelVersion: { storageKey: string } };
    expect(payload.modelVersion.storageKey).toBe(
      "applications/app-1/models/model-1/versions/1.0.0.tflite",
    );

    expect(createMock).toHaveBeenCalledTimes(1);
    const input = createMock.mock.calls[0]?.[0];
    expect(input?.applicationId).toBe("app-1");
    expect(input?.modelId).toBe("model-1");
    expect(input?.userId).toBe("admin");
    expect(input?.version).toBe("1.0.0");
    expect(Array.from(input?.bytes ?? [])).toEqual([1, 2, 3, 4]);
    expect(input?.maxBytes).toBe(128 * 1024 * 1024);
  });

  it("rejects a missing version field without creating", async () => {
    const { app, createMock } = makeApp();
    const response = await app.request(MODEL_URL, uploadRequest({ version: null }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "invalidVersion" });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects non-SemVer versions", async () => {
    const { app, createMock } = makeApp();
    const response = await app.request(MODEL_URL, uploadRequest({ version: "1.0" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "invalidVersion" });
    expect(createMock).not.toHaveBeenCalled();
  });

  it.each(["forbidden", "archived", "versionExists", "modelNotFound", "notFound"] as const)(
    "maps the %s failure to its typed status and message",
    async (reason) => {
      const { app } = makeApp({ create: async () => ({ ok: false, reason }) });
      const response = await app.request(MODEL_URL, uploadRequest());

      const expectedStatus: Record<string, number> = {
        forbidden: 403,
        archived: 409,
        versionExists: 409,
        modelNotFound: 404,
        notFound: 404,
      };
      expect(response.status).toBe(expectedStatus[reason]);
    },
  );

  it("returns the archived application code used by the dashboard", async () => {
    const { app } = makeApp({
      application: archivedApplication,
      create: async () => ({ ok: false, reason: "archived" }),
    });
    const response = await app.request(MODEL_URL, uploadRequest());

    await expect(response.json()).resolves.toMatchObject({ code: "applicationArchived" });
  });

  it("rejects compressed files with a dedicated code", async () => {
    const { app } = makeApp({ create: async () => ({ ok: false, reason: "compressed" }) });
    const response = await app.request(MODEL_URL, uploadRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "compressedModelFile" });
  });

  it.each(["identifier", "root-offset", "vtable", "size"] as const)(
    "rejects invalid model files (%s) as invalidModelFile",
    async (reason) => {
      const { app } = makeApp({ create: async () => ({ ok: false, reason }) });
      const response = await app.request(MODEL_URL, uploadRequest());

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: "invalidModelFile" });
    },
  );

  it.each(["storageFailed", "storageConflict", "databaseFailed"] as const)(
    "reports %s as a retryable 500",
    async (reason) => {
      const { app } = makeApp({ create: async () => ({ ok: false, reason }) });
      const response = await app.request(MODEL_URL, uploadRequest());

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({ code: "modelVersionSaveFailed" });
    },
  );
});
