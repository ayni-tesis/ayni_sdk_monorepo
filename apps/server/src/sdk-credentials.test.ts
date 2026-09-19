import { describe, expect, it, vi } from "vitest";

import type { Application } from "./applications";
import {
  type CreateSdkCredentialResult,
  createSdkCredential,
  type ListSdkCredentialsResult,
  listSdkCredentials,
  type RegenerateSdkCredentialResult,
  regenerateSdkCredential,
} from "./sdk-credential-store";
import {
  createSdkCredentialsApp,
  deriveSdkCredentialPrefix,
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
  create = async ({
    applicationId,
  }: {
    applicationId: string;
    userId: string;
  }): Promise<CreateSdkCredentialResult> => ({
    ok: true,
    credential: {
      id: "cred-1",
      applicationId,
      secret: "ayni_sk_abcd1234rest-of-secret",
    },
  }),
  list = async ({
    applicationId,
  }: {
    applicationId: string;
    userId: string;
  }): Promise<ListSdkCredentialsResult> => ({
    ok: true,
    credentials: [
      {
        id: "cred-1",
        applicationId,
        prefix: "ayni_sk_abcd",
        status: "active",
        createdAt: "2026-09-18T20:00:00.000Z",
        lastUsedAt: null,
      },
    ],
  }),
  regenerate = async ({
    applicationId,
    credentialId,
  }: {
    applicationId: string;
    credentialId: string;
    userId: string;
  }): Promise<RegenerateSdkCredentialResult> => ({
    ok: true,
    credential: {
      id: "cred-2",
      applicationId,
      secret: "ayni_sk_newsecret123456789",
    },
    revokedCredentialId: credentialId,
  }),
}: {
  session?: { user: { id: string } } | null;
  application?: Application | null;
  create?: (input: { applicationId: string; userId: string }) => Promise<CreateSdkCredentialResult>;
  list?: (input: { applicationId: string; userId: string }) => Promise<ListSdkCredentialsResult>;
  regenerate?: (input: {
    applicationId: string;
    credentialId: string;
    userId: string;
  }) => Promise<RegenerateSdkCredentialResult>;
} = {}) {
  const createMock = vi.fn(create);
  const listMock = vi.fn(list);
  const regenerateMock = vi.fn(regenerate);
  return {
    create: createMock,
    list: listMock,
    regenerate: regenerateMock,
    request: createSdkCredentialsApp({
      getSession: async () => session,
      applications: {
        get: async () => application ?? undefined,
      },
      credentials: {
        create: createMock,
        list: listMock,
        regenerate: regenerateMock,
      },
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
    expect(create).toHaveBeenCalledWith({ applicationId: "app-1", userId: "admin" });
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
    const { request, create } = makeApp({
      create: async () => ({ ok: false, reason: "forbidden" }),
    });

    const response = await request.request("/applications/app-1/sdk-credentials", {
      method: "POST",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para administrar credenciales.",
    });
    expect(create).toHaveBeenCalledWith({ applicationId: "app-1", userId: "admin" });
  });

  it("returns not found when the user is not a workspace member", async () => {
    const { request, create } = makeApp({
      create: async () => ({ ok: false, reason: "notFound" }),
    });

    const response = await request.request("/applications/app-1/sdk-credentials", {
      method: "POST",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos esta aplicación.",
    });
    expect(create).toHaveBeenCalledWith({ applicationId: "app-1", userId: "admin" });
  });

  it("rejects an archived application with the applicationArchived state", async () => {
    const { request, create } = makeApp({
      create: async () => ({ ok: false, reason: "archived" }),
    });

    const response = await request.request("/applications/app-1/sdk-credentials", {
      method: "POST",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "No puedes generar credenciales para una aplicación archivada.",
      code: "applicationArchived",
    });
    expect(create).toHaveBeenCalledWith({ applicationId: "app-1", userId: "admin" });
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

describe("POST /applications/:applicationId/sdk-credentials/:credentialId/regenerate", () => {
  it("allows an administrator to regenerate an active credential, returning the new secret", async () => {
    const { request, regenerate } = makeApp();

    const response = await request.request(
      "/applications/app-1/sdk-credentials/cred-1/regenerate",
      { method: "POST" },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      credential: {
        id: "cred-2",
        applicationId: "app-1",
        secret: "ayni_sk_newsecret123456789",
      },
    });
    expect(regenerate).toHaveBeenCalledWith({
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "admin",
    });
  });

  it("requires an authenticated session", async () => {
    const { request, regenerate } = makeApp({ session: null });

    const response = await request.request(
      "/applications/app-1/sdk-credentials/cred-1/regenerate",
      { method: "POST" },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Authentication required" });
    expect(regenerate).not.toHaveBeenCalled();
  });

  it("rejects a member without administration permissions", async () => {
    const { request } = makeApp({
      regenerate: async () => ({ ok: false, reason: "forbidden" }),
    });

    const response = await request.request(
      "/applications/app-1/sdk-credentials/cred-1/regenerate",
      { method: "POST" },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para regenerar credenciales.",
    });
  });

  it("rejects an inactive or revoked credential with 409 and credentialNotActive", async () => {
    const { request } = makeApp({
      regenerate: async () => ({ ok: false, reason: "notActive" }),
    });

    const response = await request.request(
      "/applications/app-1/sdk-credentials/cred-1/regenerate",
      { method: "POST" },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "Solo puedes regenerar credenciales activas.",
      code: "credentialNotActive",
    });
  });

  it("rejects an archived application with 409 and applicationArchived", async () => {
    const { request } = makeApp({
      regenerate: async () => ({ ok: false, reason: "archived" }),
    });

    const response = await request.request(
      "/applications/app-1/sdk-credentials/cred-1/regenerate",
      { method: "POST" },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "No puedes generar credenciales para una aplicación archivada.",
      code: "applicationArchived",
    });
  });

  it("returns not found when the application does not exist", async () => {
    const { request, regenerate } = makeApp({ application: null });

    const response = await request.request(
      "/applications/missing/sdk-credentials/cred-1/regenerate",
      { method: "POST" },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos esta aplicación.",
    });
    expect(regenerate).not.toHaveBeenCalled();
  });

  it("returns not found when the credential does not exist", async () => {
    const { request } = makeApp({
      regenerate: async () => ({ ok: false, reason: "notFound" }),
    });

    const response = await request.request(
      "/applications/app-1/sdk-credentials/missing/regenerate",
      { method: "POST" },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos esta aplicación.",
    });
  });
});

describe("GET /applications/:applicationId/sdk-credentials", () => {
  it("allows an administrator to list credentials", async () => {
    const { request, list } = makeApp();

    const response = await request.request("/applications/app-1/sdk-credentials", {
      method: "GET",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      credentials: [
        {
          id: "cred-1",
          applicationId: "app-1",
          prefix: "ayni_sk_abcd",
          status: "active",
          createdAt: "2026-09-18T20:00:00.000Z",
          lastUsedAt: null,
        },
      ],
    });
    expect(list).toHaveBeenCalledWith({ applicationId: "app-1", userId: "admin" });
  });

  it("requires an authenticated session", async () => {
    const { request, list } = makeApp({ session: null });

    const response = await request.request("/applications/app-1/sdk-credentials", {
      method: "GET",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Authentication required" });
    expect(list).not.toHaveBeenCalled();
  });

  it("rejects a member without administration permissions", async () => {
    const { request } = makeApp({
      list: async () => ({ ok: false, reason: "forbidden" }),
    });

    const response = await request.request("/applications/app-1/sdk-credentials", {
      method: "GET",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para ver las credenciales de esta aplicación.",
    });
  });

  it("returns not found when the application does not exist", async () => {
    const { request, list } = makeApp({ application: null });

    const response = await request.request("/applications/missing/sdk-credentials", {
      method: "GET",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos esta aplicación.",
    });
    expect(list).not.toHaveBeenCalled();
  });
});

type FakeTransactionState = {
  application: Record<string, unknown> | undefined;
  membership: Record<string, unknown> | undefined;
  credential?: Record<string, unknown> | undefined;
  credentials?: Record<string, unknown>[];
  inserted: Record<string, unknown>[];
  updated?: Record<string, unknown>[];
};

function makeTransactionDb(state: FakeTransactionState) {
  state.updated = state.updated ?? [];
  const values = vi.fn((value: Record<string, unknown>) => {
    const row = { id: "cred-1", applicationId: value.applicationId };
    state.inserted.push(row);
    return { returning: async () => [row] };
  });

  const updateSet = vi.fn((value: Record<string, unknown>) => {
    state.updated?.push(value);
    return {
      where: vi.fn(async () => []),
    };
  });

  let selectCount = 0;
  const executor = {
    select: (fields: Record<string, unknown>) => {
      void fields;
      let rows: Record<string, unknown>[] = [];
      if (selectCount === 0) {
        rows = state.application ? [state.application] : [];
      } else if (selectCount === 1) {
        rows = state.membership ? [state.membership] : [];
      } else if (selectCount === 2) {
        rows = state.credential ? [state.credential] : (state.credentials ?? []);
      }
      selectCount += 1;
      return {
        from: (table: unknown) => {
          void table;
          return {
            where: (condition: unknown) => {
              void condition;
              return Object.assign(Promise.resolve(rows), {
                limit: (count: number) => {
                  void count;
                  return {
                    for: (strength: "update") => {
                      void strength;
                      return Promise.resolve(rows);
                    },
                  };
                },
              });
            },
          };
        },
      };
    },
    insert: (table: unknown) => {
      void table;
      return { values };
    },
    update: (table: unknown) => {
      void table;
      return { set: updateSet };
    },
  };

  return {
    values,
    updateSet,
    db: {
      transaction: <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        selectCount = 0;
        return callback(executor);
      },
    },
  };
}

describe("createSdkCredential", () => {
  it("creates a credential for an administrator of an active application", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "owner" },
      inserted: [],
    });

    const result = await createSdkCredential(transaction.db, {
      applicationId: "app-1",
      userId: "admin",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credential.id).toBe("cred-1");
      expect(result.credential.applicationId).toBe("app-1");
      expect(result.credential.secret.startsWith("ayni_sk_")).toBe(true);
    }
    expect(transaction.values).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "app-1",
        secretHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });

  it("rejects an application archived before issuance without inserting a credential", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: { role: "admin" },
      inserted: [],
    });

    const result = await createSdkCredential(transaction.db, {
      applicationId: "app-1",
      userId: "admin",
    });

    expect(result).toEqual({ ok: false, reason: "archived" });
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("returns not found for an archived application when the user is not a member", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: undefined,
      inserted: [],
    });

    const result = await createSdkCredential(transaction.db, {
      applicationId: "app-1",
      userId: "user-outside",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("rejects a member without administration permissions without inserting a credential", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "member" },
      inserted: [],
    });

    const result = await createSdkCredential(transaction.db, {
      applicationId: "app-1",
      userId: "user-1",
    });

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("rejects a user without membership without inserting a credential", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: undefined,
      inserted: [],
    });

    const result = await createSdkCredential(transaction.db, {
      applicationId: "app-1",
      userId: "user-outside",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("checks membership inside the creation transaction so a demotion before commit blocks issuance", async () => {
    const state: FakeTransactionState = {
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "admin" },
      inserted: [],
    };
    const transaction = makeTransactionDb(state);

    const allowed = await createSdkCredential(transaction.db, {
      applicationId: "app-1",
      userId: "admin",
    });

    expect(allowed).toEqual({ ok: true, credential: expect.objectContaining({ id: "cred-1" }) });
    expect(state.inserted).toHaveLength(1);

    state.membership = { role: "member" };

    const demoted = await createSdkCredential(transaction.db, {
      applicationId: "app-1",
      userId: "admin",
    });

    expect(demoted).toEqual({ ok: false, reason: "forbidden" });
    expect(state.inserted).toHaveLength(1);
  });

  it("returns not found when the application does not exist", async () => {
    const transaction = makeTransactionDb({
      application: undefined,
      membership: { role: "admin" },
      inserted: [],
    });

    const result = await createSdkCredential(transaction.db, {
      applicationId: "missing",
      userId: "admin",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(transaction.values).not.toHaveBeenCalled();
  });
});

describe("regenerateSdkCredential", () => {
  it("revokes the previous active credential and creates a new one with a new secret", async () => {
    const state: FakeTransactionState = {
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "admin" },
      credential: { id: "cred-1", applicationId: "app-1", status: "active" },
      inserted: [],
      updated: [],
    };
    const transaction = makeTransactionDb(state);

    const result = await regenerateSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "admin",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credential.id).toBe("cred-1");
      expect(result.credential.applicationId).toBe("app-1");
      expect(result.credential.secret.startsWith("ayni_sk_")).toBe(true);
      expect(result.revokedCredentialId).toBe("cred-1");
    }

    expect(state.updated).toContainEqual(
      expect.objectContaining({
        status: "revoked",
        revokedAt: expect.any(Date),
      }),
    );
    expect(transaction.values).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "app-1",
        status: "active",
        prefix: expect.stringMatching(/^ayni_sk_/),
        secretHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });

  it("rejects a credential that is already revoked without modifying or inserting", async () => {
    const state: FakeTransactionState = {
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "admin" },
      credential: { id: "cred-1", applicationId: "app-1", status: "revoked" },
      inserted: [],
      updated: [],
    };
    const transaction = makeTransactionDb(state);

    const result = await regenerateSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "admin",
    });

    expect(result).toEqual({ ok: false, reason: "notActive" });
    expect(state.updated).toHaveLength(0);
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("rejects a member without administration permissions, conserving the active credential", async () => {
    const state: FakeTransactionState = {
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "member" },
      credential: { id: "cred-1", applicationId: "app-1", status: "active" },
      inserted: [],
      updated: [],
    };
    const transaction = makeTransactionDb(state);

    const result = await regenerateSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "user-1",
    });

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(state.updated).toHaveLength(0);
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("rejects an archived application before regenerating", async () => {
    const state: FakeTransactionState = {
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: { role: "admin" },
      credential: { id: "cred-1", applicationId: "app-1", status: "active" },
      inserted: [],
      updated: [],
    };
    const transaction = makeTransactionDb(state);

    const result = await regenerateSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "admin",
    });

    expect(result).toEqual({ ok: false, reason: "archived" });
    expect(state.updated).toHaveLength(0);
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("returns not found when the credential does not exist", async () => {
    const state: FakeTransactionState = {
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "admin" },
      credential: undefined,
      inserted: [],
      updated: [],
    };
    const transaction = makeTransactionDb(state);

    const result = await regenerateSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "missing-cred",
      userId: "admin",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(state.updated).toHaveLength(0);
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("returns not found when the application does not exist", async () => {
    const transaction = makeTransactionDb({
      application: undefined,
      membership: { role: "admin" },
      credential: { id: "cred-1", applicationId: "app-1", status: "active" },
      inserted: [],
    });

    const result = await regenerateSdkCredential(transaction.db, {
      applicationId: "missing",
      credentialId: "cred-1",
      userId: "admin",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("returns not found when the user is not a member", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: undefined,
      credential: { id: "cred-1", applicationId: "app-1", status: "active" },
      inserted: [],
    });

    const result = await regenerateSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "outside-user",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("checks membership inside the transaction so demotion before commit blocks issuance", async () => {
    const state: FakeTransactionState = {
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "admin" },
      credential: { id: "cred-1", applicationId: "app-1", status: "active" },
      inserted: [],
      updated: [],
    };
    const transaction = makeTransactionDb(state);

    const allowed = await regenerateSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "admin",
    });

    expect(allowed).toEqual({
      ok: true,
      credential: expect.objectContaining({ id: "cred-1" }),
      revokedCredentialId: "cred-1",
    });

    state.membership = { role: "member" };

    const demoted = await regenerateSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "admin",
    });

    expect(demoted).toEqual({ ok: false, reason: "forbidden" });
  });
});

describe("listSdkCredentials", () => {
  it("lists credentials for an application ordered newest first", async () => {
    const oldDate = new Date("2026-01-01T10:00:00.000Z");
    const newDate = new Date("2026-02-01T10:00:00.000Z");
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "admin" },
      credentials: [
        {
          id: "c1",
          applicationId: "app-1",
          prefix: "p1",
          status: "revoked",
          createdAt: oldDate,
          lastUsedAt: null,
        },
        {
          id: "c2",
          applicationId: "app-1",
          prefix: "p2",
          status: "active",
          createdAt: newDate,
          lastUsedAt: newDate,
        },
      ],
      inserted: [],
    });

    const result = await listSdkCredentials(transaction.db, {
      applicationId: "app-1",
      userId: "admin",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credentials.map((c) => c.id)).toEqual(["c2", "c1"]);
      expect(result.credentials[0]?.status).toBe("active");
      expect(result.credentials[1]?.status).toBe("revoked");
    }
  });

  it("returns empty list when application has no credentials", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "admin" },
      credentials: [],
      inserted: [],
    });

    const result = await listSdkCredentials(transaction.db, {
      applicationId: "app-1",
      userId: "admin",
    });

    expect(result).toEqual({ ok: true, credentials: [] });
  });

  it("rejects a member without administration permissions", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "member" },
      credentials: [],
      inserted: [],
    });

    const result = await listSdkCredentials(transaction.db, {
      applicationId: "app-1",
      userId: "member-user",
    });

    expect(result).toEqual({ ok: false, reason: "forbidden" });
  });

  it("returns not found when application does not exist", async () => {
    const transaction = makeTransactionDb({
      application: undefined,
      membership: { role: "admin" },
      credentials: [],
      inserted: [],
    });

    const result = await listSdkCredentials(transaction.db, {
      applicationId: "missing",
      userId: "admin",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
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

  it("derives a short display prefix that is not the secret", () => {
    const secret = generateSdkCredentialSecret();
    const prefix = deriveSdkCredentialPrefix(secret);

    expect(prefix).toBe(secret.slice(0, 12));
    expect(prefix.startsWith("ayni_sk_")).toBe(true);
    expect(secret.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(secret.length);
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
