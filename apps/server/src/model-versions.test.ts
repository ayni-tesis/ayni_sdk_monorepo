import { describe, expect, it, vi } from "vitest";

import type { Application } from "./applications";
import type {
  CreateModelVersionResult,
  DeleteModelVersionResult,
  ListModelVersionsResult,
  ModelVersionListItem,
} from "./model-version-store";
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
  membershipRole = "admin",
  create = async (): Promise<CreateModelVersionResult> => validVersionResult(),
  list = async (): Promise<ListModelVersionsResult> => ({ ok: true, versions: [] }),
  remove = async (): Promise<DeleteModelVersionResult> => ({ ok: true }),
  setContract = async (input: {
    contract: import("./model-version-store").ModelVersionContract;
  }) => ({ ok: true as const, contract: input.contract }),
}: {
  session?: { user: { id: string } } | null;
  application?: Application | null;
  membershipRole?: string | null;
  create?: (input: {
    applicationId: string;
    modelId: string;
    userId: string;
    version: string;
    bytes: Uint8Array;
    maxBytes: number;
  }) => Promise<CreateModelVersionResult>;
  list?: (applicationId: string, modelId: string) => Promise<ListModelVersionsResult>;
  remove?: (input: {
    applicationId: string;
    modelId: string;
    modelVersionId: string;
    userId: string;
  }) => Promise<DeleteModelVersionResult>;
  setContract?: (input: {
    applicationId: string;
    modelId: string;
    modelVersionId: string;
    userId: string;
    contract: import("./model-version-store").ModelVersionContract;
  }) => Promise<
    | { ok: true; contract: import("./model-version-store").ModelVersionContract }
    | { ok: false; reason: "notFound" | "forbidden" | "archived" | "databaseFailed" }
  >;
} = {}) {
  const createMock = vi.fn(create);
  const listMock = vi.fn(list);
  const removeMock = vi.fn(remove);
  const setContractMock = vi.fn(
    setContract ?? (async (input) => ({ ok: true as const, contract: input.contract })),
  );
  const app = createModelVersionsApp({
    getSession: async () => session,
    applications: {
      get: async () => application ?? undefined,
      getMembership: async () => membershipRole ?? undefined,
    },
    modelVersions: {
      create: createMock,
      list: listMock,
      remove: removeMock,
      setContract: setContractMock,
    },
  });
  return { app, createMock, listMock, removeMock };
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

describe("DELETE /applications/:applicationId/models/:modelId/versions/:modelVersionId", () => {
  const VERSION_URL = `${MODEL_URL}/mv-1`;

  it("deletes an unreferenced model version for an administrator", async () => {
    const { app, removeMock } = makeApp();

    const response = await app.request(VERSION_URL, { method: "DELETE" });

    expect(response.status).toBe(204);
    expect(removeMock).toHaveBeenCalledWith({
      applicationId: "app-1",
      modelId: "model-1",
      modelVersionId: "mv-1",
      userId: "admin",
    });
  });

  it("rejects deletion when a published workflow references the version", async () => {
    const { app, removeMock } = makeApp({
      remove: async () => ({ ok: false, reason: "inUse" }),
    });

    const response = await app.request(VERSION_URL, { method: "DELETE" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "No puedes eliminar esta versión porque un workflow la usa.",
      code: "modelVersionInUse",
    });
    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it("rejects members without administration permissions", async () => {
    const { app, removeMock } = makeApp({
      remove: async () => ({ ok: false, reason: "forbidden" }),
    });

    const response = await app.request(VERSION_URL, { method: "DELETE" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para eliminar versiones de modelo.",
      code: "forbidden",
    });
    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});

const listedVersion: ModelVersionListItem = {
  id: "mv-1",
  version: "1.0.0",
  sha256: "a".repeat(64),
  sizeBytes: 2048,
  createdAt: "2026-09-20T00:00:00.000Z",
  contract: null,
};

describe("GET /applications/:applicationId/models/:modelId/versions", () => {
  it("lists versions for any workspace member", async () => {
    const { app, listMock } = makeApp({
      membershipRole: "member",
      list: async () => ({ ok: true, versions: [listedVersion] }),
    });

    const response = await app.request(MODEL_URL);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ versions: [listedVersion] });
    expect(listMock).toHaveBeenCalledWith("app-1", "model-1");
  });

  it("returns an empty list for a model without versions", async () => {
    const { app } = makeApp({ list: async () => ({ ok: true, versions: [] }) });

    const response = await app.request(MODEL_URL);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ versions: [] });
  });

  it("never exposes the storage key or an artifact reference", async () => {
    const { app } = makeApp({ list: async () => ({ ok: true, versions: [listedVersion] }) });

    const response = await app.request(MODEL_URL);
    const body = await response.text();

    expect(body).not.toContain("storageKey");
    expect(body).not.toContain("tflite");
  });

  it("requires authentication", async () => {
    const { app, listMock } = makeApp({ session: null });

    const response = await app.request(MODEL_URL);

    expect(response.status).toBe(401);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("hides versions of models in applications the user is not a member of", async () => {
    const { app, listMock } = makeApp({ membershipRole: null });

    const response = await app.request(MODEL_URL);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ message: "No encontramos esta aplicación." });
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing application without listing", async () => {
    const { app, listMock } = makeApp({ application: null });

    const response = await app.request("/applications/missing-app/models/model-1/versions");

    expect(response.status).toBe(404);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns the same 404 for a missing model and for a model from another application", async () => {
    const { app } = makeApp({ list: async () => ({ ok: false, reason: "modelNotFound" }) });

    const foreign = await app.request("/applications/app-1/models/other-model/versions");
    const missing = await app.request(MODEL_URL);

    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    await expect(foreign.json()).resolves.toEqual({
      message: "No encontramos este modelo.",
      code: "notFound",
    });
    await expect(missing.json()).resolves.toEqual({
      message: "No encontramos este modelo.",
      code: "notFound",
    });
  });
});
