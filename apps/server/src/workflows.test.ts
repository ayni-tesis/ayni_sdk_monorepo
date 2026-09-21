import { describe, expect, it, vi } from "vitest";

import type { Application } from "./applications";
import {
  type CreateWorkflowResult,
  createWorkflow,
  type TransactionExecutor,
} from "./workflow-store";
import { createWorkflowsApp } from "./workflows";

const activeApplication: Application = {
  id: "app-1",
  organizationId: "org-1",
  name: "Cámara",
  status: "active",
};

type CreateInput = { applicationId: string; userId: string; name: string };

function makeApp({
  session = { user: { id: "admin" } },
  application = activeApplication,
  membershipRole = "admin",
  create = async ({ applicationId, name }: CreateInput): Promise<CreateWorkflowResult> => ({
    ok: true,
    workflow: {
      id: "workflow-1",
      applicationId,
      name,
      status: "draft",
      createdAt: "2026-09-21T15:00:00.000Z",
      updatedAt: "2026-09-21T15:00:00.000Z",
    },
  }),
}: {
  session?: { user: { id: string } } | null;
  application?: Application | null;
  membershipRole?: string | null;
  create?: (input: CreateInput) => Promise<CreateWorkflowResult>;
} = {}) {
  const createMock = vi.fn(create);
  return {
    create: createMock,
    request: createWorkflowsApp({
      getSession: async () => session,
      applications: {
        get: async () => application ?? undefined,
        getMembership: async () => membershipRole ?? undefined,
      },
      workflows: { create: createMock },
    }),
  };
}

function postWorkflow(request: ReturnType<typeof makeApp>["request"], body: unknown) {
  return request.request("/applications/app-1/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /applications/:applicationId/workflows", () => {
  it("lets an administrator create a draft workflow bound to the application", async () => {
    const { request, create } = makeApp();

    const response = await postWorkflow(request, { name: "Diagnóstico de hoja de café" });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      workflow: {
        id: "workflow-1",
        applicationId: "app-1",
        name: "Diagnóstico de hoja de café",
        status: "draft",
        createdAt: "2026-09-21T15:00:00.000Z",
        updatedAt: "2026-09-21T15:00:00.000Z",
      },
    });
    expect(create).toHaveBeenCalledWith({
      applicationId: "app-1",
      userId: "admin",
      name: "Diagnóstico de hoja de café",
    });
  });

  it("trims the name before creating the workflow", async () => {
    const { request, create } = makeApp();

    const response = await postWorkflow(request, { name: "  Diagnóstico  " });

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith({
      applicationId: "app-1",
      userId: "admin",
      name: "Diagnóstico",
    });
  });

  it.each([
    ["an empty name", { name: "" }],
    ["a whitespace-only name", { name: "   " }],
    ["an omitted name", {}],
    ["a non-string name", { name: 42 }],
  ])("rejects %s with 400 and does not create the workflow", async (_label, body) => {
    const { request, create } = makeApp();

    const response = await postWorkflow(request, body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Ingresa un nombre para el workflow.",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("requires an authenticated session", async () => {
    const { request, create } = makeApp({ session: null });

    const response = await postWorkflow(request, { name: "Diagnóstico" });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Authentication required" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a member without administration permissions with 403", async () => {
    const { request, create } = makeApp({
      membershipRole: "member",
      create: async () => ({ ok: false, reason: "forbidden" }),
    });

    const response = await postWorkflow(request, { name: "Diagnóstico" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para crear workflows.",
    });
    expect(create).toHaveBeenCalledWith({
      applicationId: "app-1",
      userId: "admin",
      name: "Diagnóstico",
    });
  });

  it("rejects an archived application with the applicationArchived code and status 409", async () => {
    const { request } = makeApp({
      create: async () => ({ ok: false, reason: "archived" }),
    });

    const response = await postWorkflow(request, { name: "Diagnóstico" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "No puedes crear workflows en una aplicación archivada.",
      code: "applicationArchived",
    });
  });

  it("returns not found when the store no longer finds the application", async () => {
    const { request } = makeApp({
      create: async () => ({ ok: false, reason: "notFound" }),
    });

    const response = await postWorkflow(request, { name: "Diagnóstico" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos esta aplicación.",
    });
  });

  it("returns not found when the application does not exist", async () => {
    const { request, create } = makeApp({ application: null });

    const response = await postWorkflow(request, { name: "Diagnóstico" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos esta aplicación.",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("does not reveal the application to non-members, even with an invalid body", async () => {
    const { request, create } = makeApp({ membershipRole: null });

    const invalidBody = await postWorkflow(request, { name: "" });
    const validBody = await postWorkflow(request, { name: "Diagnóstico" });

    for (const response of [invalidBody, validBody]) {
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        message: "No encontramos esta aplicación.",
      });
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a body that is not valid JSON with 400", async () => {
    const { request, create } = makeApp();

    const response = await request.request("/applications/app-1/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Ingresa un nombre para el workflow.",
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
      id: value.id,
      applicationId: value.applicationId,
      name: value.name,
      status: value.status,
      createdAt: new Date("2026-09-21T15:00:00.000Z"),
      updatedAt: new Date("2026-09-21T15:00:00.000Z"),
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

describe("createWorkflow", () => {
  it("creates a draft workflow for an administrator of an active application", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "admin" },
      inserted: [],
    });

    const result = await createWorkflow(transaction.db, {
      applicationId: "app-1",
      userId: "admin",
      name: "Diagnóstico de hoja de café",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workflow).toEqual({
        id: expect.any(String),
        applicationId: "app-1",
        name: "Diagnóstico de hoja de café",
        status: "draft",
        createdAt: "2026-09-21T15:00:00.000Z",
        updatedAt: "2026-09-21T15:00:00.000Z",
      });
    }
    expect(transaction.values).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "app-1",
        name: "Diagnóstico de hoja de café",
        status: "draft",
      }),
    );
  });

  it("lets an owner create a workflow too", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "owner" },
      inserted: [],
    });

    const result = await createWorkflow(transaction.db, {
      applicationId: "app-1",
      userId: "owner",
      name: "Diagnóstico",
    });

    expect(result.ok).toBe(true);
    expect(transaction.inserted).toHaveLength(1);
  });

  it("checks membership before checking archived status", async () => {
    const nonMemberTx = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: undefined,
      inserted: [],
    });

    const nonMemberResult = await createWorkflow(nonMemberTx.db, {
      applicationId: "app-1",
      userId: "stranger",
      name: "Diagnóstico",
    });

    expect(nonMemberResult).toEqual({ ok: false, reason: "notFound" });

    const memberTx = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: { role: "member" },
      inserted: [],
    });

    const memberResult = await createWorkflow(memberTx.db, {
      applicationId: "app-1",
      userId: "regular-user",
      name: "Diagnóstico",
    });

    expect(memberResult).toEqual({ ok: false, reason: "forbidden" });
    expect(nonMemberTx.inserted).toHaveLength(0);
    expect(memberTx.inserted).toHaveLength(0);
  });

  it("rejects a plain member of an active application without inserting a workflow", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "member" },
      inserted: [],
    });

    const result = await createWorkflow(transaction.db, {
      applicationId: "app-1",
      userId: "regular-user",
      name: "Diagnóstico",
    });

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(transaction.inserted).toHaveLength(0);
  });

  it("rejects an archived application without inserting a workflow", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: { role: "admin" },
      inserted: [],
    });

    const result = await createWorkflow(transaction.db, {
      applicationId: "app-1",
      userId: "admin",
      name: "Diagnóstico",
    });

    expect(result).toEqual({ ok: false, reason: "archived" });
    expect(transaction.inserted).toHaveLength(0);
  });

  it("returns notFound when the application does not exist", async () => {
    const transaction = makeTransactionDb({
      application: undefined,
      membership: { role: "admin" },
      inserted: [],
    });

    const result = await createWorkflow(transaction.db, {
      applicationId: "missing-app",
      userId: "admin",
      name: "Diagnóstico",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(transaction.inserted).toHaveLength(0);
  });
});
