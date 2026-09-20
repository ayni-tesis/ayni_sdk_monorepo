import { describe, expect, it, vi } from "vitest";

import type { Application } from "./applications";
import {
  type CreateModelResult,
  createModel,
  type Model,
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
  createdAt: "2026-09-19T20:00:00.000Z",
  updatedAt: "2026-09-19T20:00:00.000Z",
};

function makeApp({
  session = { user: { id: "admin" } },
  application = activeApplication,
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
    },
  }),
}: {
  session?: { user: { id: string } } | null;
  application?: Application | null;
  create?: (input: {
    applicationId: string;
    userId: string;
    name: string;
    runtime: "tensorflow_lite";
  }) => Promise<CreateModelResult>;
} = {}) {
  const createMock = vi.fn(create);
  return {
    create: createMock,
    request: createModelsApp({
      getSession: async () => session,
      applications: {
        get: async () => application ?? undefined,
      },
      models: { create: createMock },
    }),
  };
}

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
};

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
  const executor: TransactionExecutor = {
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
  };

  return {
    values,
    inserted: state.inserted,
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
