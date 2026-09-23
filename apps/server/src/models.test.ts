import { describe, expect, it, vi } from "vitest";

import type { Application } from "./applications";
import {
  type CreateModelResult,
  createModel,
  listModels,
  type Model,
  type RenameModelResult,
  renameModel,
  type TransactionExecutor,
} from "./model-store";
import { createModelsApp } from "./models";

const activeApplication: Application = {
  id: "app-1",
  organizationId: "org-1",
  name: "Cámara",
  status: "active",
};

const sampleModel: Model = {
  id: "model-1",
  applicationId: "app-1",
  name: "Detector de plagas",
  runtime: "tensorflow_lite",
  versionCount: 2,
  createdAt: "2026-09-19T20:00:00.000Z",
  updatedAt: "2026-09-19T20:00:00.000Z",
};

function makeApp({
  session = { user: { id: "admin" } },
  application = activeApplication,
  membershipRole = "admin",
  listedModels,
  create = async ({
    applicationId,
    name,
    runtime,
  }: {
    applicationId: string;
    userId: string;
    name: string;
    runtime: "tensorflow_lite";
  }): Promise<CreateModelResult> => ({
    ok: true,
    model: {
      ...sampleModel,
      applicationId,
      name,
      runtime,
      versionCount: 0,
    },
  }),
  rename = async ({
    applicationId,
    name,
  }: {
    applicationId: string;
    modelId: string;
    userId: string;
    name: string;
  }): Promise<RenameModelResult> => ({
    ok: true,
    model: {
      id: sampleModel.id,
      applicationId,
      name,
      runtime: sampleModel.runtime,
      createdAt: sampleModel.createdAt,
      updatedAt: sampleModel.updatedAt,
    },
  }),
}: {
  session?: { user: { id: string } } | null;
  application?: Application | null;
  membershipRole?: string | null;
  listedModels?: Model[];
  create?: (input: {
    applicationId: string;
    userId: string;
    name: string;
    runtime: "tensorflow_lite";
  }) => Promise<CreateModelResult>;
  rename?: (input: {
    applicationId: string;
    modelId: string;
    userId: string;
    name: string;
  }) => Promise<RenameModelResult>;
} = {}) {
  const createMock = vi.fn(create);
  const listMock = vi.fn(async () => listedModels ?? [sampleModel]);
  const renameMock = vi.fn(rename);
  return {
    create: createMock,
    list: listMock,
    rename: renameMock,
    request: createModelsApp({
      getSession: async () => session,
      applications: {
        get: async () => application ?? undefined,
        getMembership: async () => membershipRole ?? undefined,
      },
      models: { create: createMock, list: listMock, rename: renameMock },
    }),
  };
}

describe("GET /applications/:applicationId/models", () => {
  it("lists models for any workspace member", async () => {
    const { request, list } = makeApp({ membershipRole: "member" });

    const response = await request.request("/applications/app-1/models");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ models: [sampleModel] });
    expect(list).toHaveBeenCalledWith("app-1");
  });

  it("exposes each model's version count without any file metadata", async () => {
    const listedModels: Model[] = [
      sampleModel,
      { ...sampleModel, id: "model-2", name: "Clasificador de roya", versionCount: 0 },
    ];
    const { request, list } = makeApp({ membershipRole: "member", listedModels });

    const response = await request.request("/applications/app-1/models");

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({ models: listedModels });
    expect(list).toHaveBeenCalledWith("app-1");
    const body = JSON.stringify(payload);
    expect(body).not.toContain("storageKey");
    expect(body).not.toContain("sha256");
  });

  it("requires authentication", async () => {
    const { request, list } = makeApp({ session: null });

    const response = await request.request("/applications/app-1/models");

    expect(response.status).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });

  it("hides applications the user is not a member of", async () => {
    const { request, list } = makeApp({ membershipRole: null });

    const response = await request.request("/applications/app-1/models");

    expect(response.status).toBe(404);
    expect(list).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing application", async () => {
    const { request } = makeApp({ application: null });

    const response = await request.request("/applications/missing-app/models");

    expect(response.status).toBe(404);
  });
});

describe("POST /applications/:applicationId/models", () => {
  it("allows an administrator to register a model for an active application", async () => {
    const { request, create } = makeApp();

    const response = await request.request("/applications/app-1/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Detector de plagas", runtime: "tensorflow_lite" }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      model: {
        id: "model-1",
        applicationId: "app-1",
        name: "Detector de plagas",
        runtime: "tensorflow_lite",
        versionCount: 0,
        createdAt: "2026-09-19T20:00:00.000Z",
        updatedAt: "2026-09-19T20:00:00.000Z",
      },
    });
    expect(create).toHaveBeenCalledWith({
      applicationId: "app-1",
      userId: "admin",
      name: "Detector de plagas",
      runtime: "tensorflow_lite",
    });
  });

  it("accepts 'TensorFlow Lite' as runtime and canonicalizes it", async () => {
    const { request, create } = makeApp();

    const response = await request.request("/applications/app-1/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Detector de plagas", runtime: "TensorFlow Lite" }),
    });

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith({
      applicationId: "app-1",
      userId: "admin",
      name: "Detector de plagas",
      runtime: "tensorflow_lite",
    });
  });

  it("requires an authenticated session", async () => {
    const { request, create } = makeApp({ session: null });

    const response = await request.request("/applications/app-1/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Detector", runtime: "tensorflow_lite" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Authentication required" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an empty or whitespace-only name with 400", async () => {
    const { request, create } = makeApp();

    const response = await request.request("/applications/app-1/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "   ", runtime: "tensorflow_lite" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Ingresa un nombre para el modelo.",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an omitted name with 400", async () => {
    const { request, create } = makeApp();

    const response = await request.request("/applications/app-1/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runtime: "tensorflow_lite" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Ingresa un nombre para el modelo.",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an unsupported runtime with 400", async () => {
    const { request, create } = makeApp();

    const response = await request.request("/applications/app-1/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Detector", runtime: "onnx" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "El primer runtime admitido es TensorFlow Lite.",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a member without administration permissions with 403", async () => {
    const { request, create } = makeApp({
      create: async () => ({ ok: false, reason: "forbidden" }),
    });

    const response = await request.request("/applications/app-1/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Detector", runtime: "tensorflow_lite" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para registrar modelos.",
    });
    expect(create).toHaveBeenCalledWith({
      applicationId: "app-1",
      userId: "admin",
      name: "Detector",
      runtime: "tensorflow_lite",
    });
  });

  it("returns not found when the user is not a workspace member", async () => {
    const { request, create } = makeApp({
      create: async () => ({ ok: false, reason: "notFound" }),
    });

    const response = await request.request("/applications/app-1/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Detector", runtime: "tensorflow_lite" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos esta aplicación.",
    });
    expect(create).toHaveBeenCalledWith({
      applicationId: "app-1",
      userId: "admin",
      name: "Detector",
      runtime: "tensorflow_lite",
    });
  });

  it("rejects an archived application with the applicationArchived code and status 409", async () => {
    const { request, create } = makeApp({
      create: async () => ({ ok: false, reason: "archived" }),
    });

    const response = await request.request("/applications/app-1/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Detector", runtime: "tensorflow_lite" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "No puedes registrar modelos en una aplicación archivada.",
      code: "applicationArchived",
    });
    expect(create).toHaveBeenCalledWith({
      applicationId: "app-1",
      userId: "admin",
      name: "Detector",
      runtime: "tensorflow_lite",
    });
  });

  it("returns not found when the application does not exist", async () => {
    const { request, create } = makeApp({ application: null });

    const response = await request.request("/applications/missing/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Detector", runtime: "tensorflow_lite" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos esta aplicación.",
    });
    expect(create).not.toHaveBeenCalled();
  });
});

type FakeTransactionState = {
  application: Record<string, unknown> | undefined;
  membership: Record<string, unknown> | undefined;
  inserted: Record<string, unknown>[];
  model?: Record<string, unknown>;
};

describe("PATCH /applications/:applicationId/models/:modelId", () => {
  function patchModel(request: ReturnType<typeof createModelsApp>, body: unknown) {
    return request.request("/applications/app-1/models/model-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("lets an administrator rename the model and returns its unchanged identity and runtime", async () => {
    const { request, rename } = makeApp();

    const response = await patchModel(request, { name: "  Detector actualizado  " });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      model: {
        id: "model-1",
        applicationId: "app-1",
        name: "Detector actualizado",
        runtime: "tensorflow_lite",
        createdAt: sampleModel.createdAt,
        updatedAt: sampleModel.updatedAt,
      },
    });
    expect(rename).toHaveBeenCalledWith({
      applicationId: "app-1",
      modelId: "model-1",
      userId: "admin",
      name: "Detector actualizado",
    });
  });

  it.each([{ name: "" }, { name: "   " }, {}, { name: 42 }])(
    "rejects an invalid name without renaming the model",
    async (body) => {
      const { request, rename } = makeApp();

      const response = await patchModel(request, body);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        message: "Ingresa un nombre para el modelo.",
      });
      expect(rename).not.toHaveBeenCalled();
    },
  );

  it("requires authentication", async () => {
    const { request, rename } = makeApp({ session: null });

    const response = await patchModel(request, { name: "Nuevo nombre" });

    expect(response.status).toBe(401);
    expect(rename).not.toHaveBeenCalled();
  });

  it("hides the application from non-members", async () => {
    const { request, rename } = makeApp({ membershipRole: null });

    const response = await patchModel(request, { name: "Nuevo nombre" });

    expect(response.status).toBe(404);
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects a workspace member without admin permissions", async () => {
    const { request, rename } = makeApp({
      membershipRole: "member",
      rename: async () => ({ ok: false, reason: "forbidden" }),
    });

    const response = await patchModel(request, { name: "Nuevo nombre" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para editar este modelo.",
    });
    expect(rename).toHaveBeenCalledTimes(1);
  });

  it("returns not found when the model does not belong to the application", async () => {
    const { request, rename } = makeApp({
      rename: async () => ({ ok: false, reason: "modelNotFound" }),
    });

    const response = await patchModel(request, { name: "Nuevo nombre" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos este modelo.",
      code: "notFound",
    });
    expect(rename).toHaveBeenCalledTimes(1);
  });
});

function makeTransactionDb(state: FakeTransactionState) {
  const values = vi.fn((value: Record<string, unknown>) => {
    const row = {
      id: "model-1",
      applicationId: value.applicationId,
      name: value.name,
      runtime: value.runtime,
      createdAt: new Date("2026-09-19T20:00:00.000Z"),
      updatedAt: new Date("2026-09-19T20:00:00.000Z"),
    };
    state.inserted.push(row);
    return { returning: async () => [row] };
  });

  let selectCount = 0;
  const updateSet = vi.fn((values: Record<string, unknown>) => ({
    where: (_condition: unknown) => ({
      returning: async () =>
        state.model
          ? [{ ...state.model, ...values, updatedAt: new Date("2026-09-22T09:00:00.000Z") }]
          : [],
    }),
  }));
  const updateMock = vi.fn((_table: unknown) => ({ set: updateSet }));
  const executor: TransactionExecutor & {
    update: typeof updateMock;
  } = {
    select: (fields: Record<string, unknown>) => {
      void fields;
      const rows =
        selectCount === 0
          ? state.application
            ? [state.application]
            : []
          : state.membership
            ? [state.membership]
            : [];
      selectCount += 1;
      return {
        from: (table: unknown) => {
          void table;
          return {
            where: (condition: unknown) => {
              void condition;
              return {
                limit: (count: number) => {
                  void count;
                  return {
                    for: (strength: "update") => {
                      void strength;
                      return Promise.resolve(rows);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    insert: (table: unknown) => {
      void table;
      return { values };
    },
    update: updateMock,
  };

  return {
    values,
    inserted: state.inserted,
    updateMock,
    updateSet,
    db: {
      transaction: <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        selectCount = 0;
        return callback(executor);
      },
    },
  };
}

describe("createModel", () => {
  it("creates a model for an administrator of an active application", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "admin" },
      inserted: [],
    });

    const result = await createModel(transaction.db, {
      applicationId: "app-1",
      userId: "admin",
      name: "Detector de plagas",
      runtime: "tensorflow_lite",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.id).toBe("model-1");
      expect(result.model.applicationId).toBe("app-1");
      expect(result.model.name).toBe("Detector de plagas");
      expect(result.model.runtime).toBe("tensorflow_lite");
    }
    expect(transaction.values).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "app-1",
        name: "Detector de plagas",
        runtime: "tensorflow_lite",
      }),
    );
  });

  it("checks membership before checking archived status", async () => {
    const nonMemberTx = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: undefined,
      inserted: [],
    });

    const nonMemberResult = await createModel(nonMemberTx.db, {
      applicationId: "app-1",
      userId: "stranger",
      name: "Detector",
      runtime: "tensorflow_lite",
    });

    expect(nonMemberResult).toEqual({ ok: false, reason: "notFound" });

    const memberTx = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: { role: "member" },
      inserted: [],
    });

    const memberResult = await createModel(memberTx.db, {
      applicationId: "app-1",
      userId: "regular-user",
      name: "Detector",
      runtime: "tensorflow_lite",
    });

    expect(memberResult).toEqual({ ok: false, reason: "forbidden" });
  });

  it("rejects an archived application without inserting a model", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: { role: "admin" },
      inserted: [],
    });

    const result = await createModel(transaction.db, {
      applicationId: "app-1",
      userId: "admin",
      name: "Detector",
      runtime: "tensorflow_lite",
    });

    expect(result).toEqual({ ok: false, reason: "archived" });
    expect(transaction.inserted).toHaveLength(0);
  });

  it("returns notFound when application does not exist", async () => {
    const transaction = makeTransactionDb({
      application: undefined,
      membership: { role: "admin" },
      inserted: [],
    });

    const result = await createModel(transaction.db, {
      applicationId: "missing-app",
      userId: "admin",
      name: "Detector",
      runtime: "tensorflow_lite",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(transaction.inserted).toHaveLength(0);
  });
});

describe("renameModel", () => {
  const activeAdminState = {
    application: { id: "app-1", organizationId: "org-1", status: "active" },
    membership: { role: "admin" },
    inserted: [],
  };

  it("updates only the model name and preserves model identity and runtime", async () => {
    const transaction = makeTransactionDb({
      ...activeAdminState,
      model: {
        id: "model-1",
        applicationId: "app-1",
        name: "Detector de plagas",
        runtime: "tensorflow_lite",
        createdAt: new Date("2026-09-19T20:00:00.000Z"),
        updatedAt: new Date("2026-09-19T20:00:00.000Z"),
      },
    });

    const result = await renameModel(transaction.db, {
      applicationId: "app-1",
      modelId: "model-1",
      userId: "admin",
      name: "Detector renovado",
    });

    expect(result).toEqual({
      ok: true,
      model: {
        id: "model-1",
        applicationId: "app-1",
        name: "Detector renovado",
        runtime: "tensorflow_lite",
        createdAt: "2026-09-19T20:00:00.000Z",
        updatedAt: "2026-09-22T09:00:00.000Z",
      },
    });
    expect(transaction.updateSet).toHaveBeenCalledWith({ name: "Detector renovado" });
  });

  it("rejects members without admin permissions without updating the model", async () => {
    const transaction = makeTransactionDb({
      ...activeAdminState,
      membership: { role: "member" },
      model: {
        id: "model-1",
        applicationId: "app-1",
        name: "Detector",
        runtime: "tensorflow_lite",
      },
    });

    const result = await renameModel(transaction.db, {
      applicationId: "app-1",
      modelId: "model-1",
      userId: "member",
      name: "Nuevo nombre",
    });

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(transaction.updateMock).not.toHaveBeenCalled();
  });

  it("rejects archived applications without updating the model", async () => {
    const transaction = makeTransactionDb({
      ...activeAdminState,
      application: { ...activeAdminState.application, status: "archived" },
      model: {
        id: "model-1",
        applicationId: "app-1",
        name: "Detector",
        runtime: "tensorflow_lite",
      },
    });

    const result = await renameModel(transaction.db, {
      applicationId: "app-1",
      modelId: "model-1",
      userId: "admin",
      name: "Nuevo nombre",
    });

    expect(result).toEqual({ ok: false, reason: "archived" });
    expect(transaction.updateMock).not.toHaveBeenCalled();
  });

  it("returns modelNotFound when the model does not belong to the application", async () => {
    const transaction = makeTransactionDb(activeAdminState);

    const result = await renameModel(transaction.db, {
      applicationId: "app-1",
      modelId: "other-model",
      userId: "admin",
      name: "Nuevo nombre",
    });

    expect(result).toEqual({ ok: false, reason: "modelNotFound" });
    expect(transaction.updateSet).toHaveBeenCalledWith({ name: "Nuevo nombre" });
  });
});

function makeListDb(rows: Record<string, unknown>[]) {
  const selectedFields: Record<string, unknown>[] = [];
  const filters: unknown[] = [];

  const executor = {
    select: (fields: Record<string, unknown>) => {
      selectedFields.push(fields);
      return {
        from: (table: unknown) => {
          void table;
          return {
            where: (condition: unknown) => {
              filters.push(condition);
              return {
                orderBy: async (column: unknown) => {
                  void column;
                  return rows;
                },
              };
            },
          };
        },
      };
    },
  };

  return {
    selectedFields,
    filters,
    db: {
      transaction: <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(executor),
    },
  };
}

describe("listModels", () => {
  it("maps rows to models with a numeric version count and ISO dates", async () => {
    const transaction = makeListDb([
      {
        id: "model-1",
        applicationId: "app-1",
        name: "Detector de plagas",
        runtime: "tensorflow_lite",
        versionCount: "3",
        createdAt: new Date("2026-09-19T20:00:00.000Z"),
        updatedAt: new Date("2026-09-19T21:00:00.000Z"),
      },
      {
        id: "model-2",
        applicationId: "app-1",
        name: "Clasificador de roya",
        runtime: "tensorflow_lite",
        versionCount: 0,
        createdAt: "2026-09-19T20:30:00.000Z",
        updatedAt: "2026-09-19T20:30:00.000Z",
      },
    ]);

    const models = await listModels(transaction.db, "app-1");

    expect(models).toEqual([
      {
        id: "model-1",
        applicationId: "app-1",
        name: "Detector de plagas",
        runtime: "tensorflow_lite",
        versionCount: 3,
        createdAt: "2026-09-19T20:00:00.000Z",
        updatedAt: "2026-09-19T21:00:00.000Z",
      },
      {
        id: "model-2",
        applicationId: "app-1",
        name: "Clasificador de roya",
        runtime: "tensorflow_lite",
        versionCount: 0,
        createdAt: "2026-09-19T20:30:00.000Z",
        updatedAt: "2026-09-19T20:30:00.000Z",
      },
    ]);
    expect(transaction.selectedFields[0]).toHaveProperty("versionCount");
    expect(transaction.filters).toHaveLength(1);
  });
});
