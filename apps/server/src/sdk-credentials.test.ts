import { describe, expect, it, vi } from "vitest";

import type { Application } from "./applications";
import {
  type CreateSdkCredentialResult,
  type CredentialQueryDatabase,
  createSdkCredential,
  type ListSdkCredentialsResult,
  listSdkCredentials,
  type ReadOnlyExecutor,
  type RegenerateSdkCredentialResult,
  regenerateSdkCredential,
  type RevokeSdkCredentialResult,
  revokeSdkCredential,
  verifySdkCredential,
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

const listedCredential = {
  id: "cred-1",
  applicationId: "app-1",
  prefix: "ayni_sk_abcd",
  status: "active" as const,
  createdAt: "2026-09-18T12:00:00.000Z",
  lastUsedAt: null,
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
  list = async (): Promise<ListSdkCredentialsResult> => ({
    ok: true,
    credentials: [listedCredential],
  }),
  revoke = async ({
    applicationId,
    credentialId,
  }: {
    applicationId: string;
    credentialId: string;
    userId: string;
  }): Promise<RevokeSdkCredentialResult> => ({
    ok: true,
    credential: {
      id: credentialId,
      applicationId,
      revokedAt: "2026-09-18T12:00:00.000Z",
    },
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
  revoke?: (input: {
    applicationId: string;
    credentialId: string;
    userId: string;
  }) => Promise<RevokeSdkCredentialResult>;
  regenerate?: (input: {
    applicationId: string;
    credentialId: string;
    userId: string;
  }) => Promise<RegenerateSdkCredentialResult>;
} = {}) {
  const createMock = vi.fn(create);
  const listMock = vi.fn(list);
  const revokeMock = vi.fn(revoke);
  const regenerateMock = vi.fn(regenerate);
  return {
    create: createMock,
    list: listMock,
    revoke: revokeMock,
    regenerate: regenerateMock,
    request: createSdkCredentialsApp({
      getSession: async () => session,
      applications: {
        get: async () => application ?? undefined,
      },
      credentials: {
        create: createMock,
        list: listMock,
        revoke: revokeMock,
        regenerate: regenerateMock,
      },
    }),
  };
}

describe("GET /applications/:applicationId/sdk-credentials", () => {
  it("lists credential metadata for an administrator without any secret", async () => {
    const { request, list } = makeApp();

    const response = await request.request("/applications/app-1/sdk-credentials");

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ credentials: [listedCredential] });
    expect(body).not.toMatch(/secret|hash/i);
    expect(list).toHaveBeenCalledWith({ applicationId: "app-1", userId: "admin" });
  });

  it("returns a clear empty list for an application without credentials", async () => {
    const { request } = makeApp({ list: async () => ({ ok: true, credentials: [] }) });

    const response = await request.request("/applications/app-1/sdk-credentials");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ credentials: [] });
  });

  it("requires an authenticated session", async () => {
    const { request, list } = makeApp({ session: null });

    const response = await request.request("/applications/app-1/sdk-credentials");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Authentication required" });
    expect(list).not.toHaveBeenCalled();
  });

  it("rejects a member without administration permissions and reveals no metadata", async () => {
    const { request } = makeApp({ list: async () => ({ ok: false, reason: "forbidden" }) });

    const response = await request.request("/applications/app-1/sdk-credentials");

    expect(response.status).toBe(403);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      message: "No tienes permiso para ver las credenciales de esta aplicación.",
    });
    expect(body).not.toMatch(/cred-1|ayni_sk/);
  });

  it("returns not found when the user is not a workspace member", async () => {
    const { request } = makeApp({ list: async () => ({ ok: false, reason: "notFound" }) });

    const response = await request.request("/applications/app-1/sdk-credentials");

    expect(response.status).toBe(404);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      message: "No encontramos esta aplicación.",
    });
    expect(body).not.toMatch(/cred-1|ayni_sk/);
  });

  it("returns not found when the application does not exist", async () => {
    const { request, list } = makeApp({ application: null });

    const response = await request.request("/applications/missing/sdk-credentials");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos esta aplicación.",
    });
    expect(list).not.toHaveBeenCalled();
  });
});

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

describe("POST /applications/:applicationId/sdk-credentials/:credentialId/revoke", () => {
  it("allows an administrator to revoke a credential", async () => {
    const { request, revoke } = makeApp();

    const response = await request.request("/applications/app-1/sdk-credentials/cred-1/revoke", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      credential: {
        id: "cred-1",
        applicationId: "app-1",
        revokedAt: "2026-09-18T12:00:00.000Z",
      },
    });
    expect(revoke).toHaveBeenCalledWith({
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "admin",
    });
  });

  it("requires an authenticated session", async () => {
    const { request, revoke } = makeApp({ session: null });

    const response = await request.request("/applications/app-1/sdk-credentials/cred-1/revoke", {
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(revoke).not.toHaveBeenCalled();
  });

  it("rejects a member without administration permissions with the revoke message", async () => {
    const { request } = makeApp({
      revoke: async () => ({ ok: false, reason: "forbidden" }),
    });

    const response = await request.request("/applications/app-1/sdk-credentials/cred-1/revoke", {
      method: "POST",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para revocar credenciales.",
    });
  });

  it("returns not found when the credential is outside the workspace", async () => {
    const { request } = makeApp({
      revoke: async () => ({ ok: false, reason: "notFound" }),
    });

    const response = await request.request("/applications/app-1/sdk-credentials/cred-x/revoke", {
      method: "POST",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos esta aplicación.",
    });
  });

  it("returns not found when the application does not exist", async () => {
    const { request, revoke } = makeApp({ application: null });

    const response = await request.request("/applications/missing/sdk-credentials/cred-1/revoke", {
      method: "POST",
    });

    expect(response.status).toBe(404);
    expect(revoke).not.toHaveBeenCalled();
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

type FakeTransactionState = {
  application: Record<string, unknown> | undefined;
  membership: Record<string, unknown> | undefined;
  credential: Record<string, unknown> | undefined;
  inserted: Record<string, unknown>[];
  updated: Record<string, unknown>[];
};

function awaitableRows(rows: Record<string, unknown>[]) {
  const promise = Promise.resolve(rows);
  return Object.assign(promise, {
    limit: (count: number) => {
      void count;
      const limited = Promise.resolve(rows);
      return Object.assign(limited, {
        for: (strength: "update") => {
          void strength;
          return Promise.resolve(rows);
        },
      });
    },
  });
}

function makeTransactionDb(state: FakeTransactionState) {
  let selectCount = 0;
  const rowsForStep = () => {
    if (selectCount === 0) return state.application ? [state.application] : [];
    if (selectCount === 1) return state.membership ? [state.membership] : [];
    return state.credential ? [state.credential] : [];
  };

  const values = vi.fn((value: Record<string, unknown>) => {
    const row = { id: "cred-1", applicationId: value.applicationId };
    state.inserted.push(row);
    return { returning: async () => [row] };
  });

  const set = vi.fn((value: Record<string, unknown>) => {
    const row = { id: "cred-1", applicationId: "app-1", ...value };
    state.updated.push(row);
    return {
      where: (condition: unknown) => {
        void condition;
        return { returning: async () => [row] };
      },
    };
  });

  const executor = {
    select: (fields: Record<string, unknown>) => {
      void fields;
      const rows = rowsForStep();
      selectCount += 1;
      return {
        from: (table: unknown) => {
          void table;
          return {
            where: (condition: unknown) => {
              void condition;
              return awaitableRows(rows);
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
      return { set };
    },
  };

  return {
    values,
    set,
    db: {
      transaction: <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        selectCount = 0;
        return callback(executor);
      },
    },
  };
}

function makeState(overrides: Partial<FakeTransactionState> = {}): FakeTransactionState {
  return {
    application: { id: "app-1", organizationId: "org-1", status: "active" },
    membership: { role: "admin" },
    credential: undefined,
    inserted: [],
    updated: [],
    ...overrides,
  };
}

describe("createSdkCredential", () => {
  it("creates a credential for an administrator of an active application", async () => {
    const transaction = makeTransactionDb(
      makeState({
        application: { id: "app-1", organizationId: "org-1", status: "active" },
        membership: { role: "owner" },
      }),
    );

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
        prefix: expect.stringMatching(/^ayni_sk_/),
      }),
    );
  });

  it("rejects an application archived before issuance without inserting a credential", async () => {
    const transaction = makeTransactionDb(
      makeState({
        application: { id: "app-1", organizationId: "org-1", status: "archived" },
      }),
    );

    const result = await createSdkCredential(transaction.db, {
      applicationId: "app-1",
      userId: "admin",
    });

    expect(result).toEqual({ ok: false, reason: "archived" });
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("returns not found for an archived application when the user is not a member", async () => {
    const transaction = makeTransactionDb(
      makeState({
        application: { id: "app-1", organizationId: "org-1", status: "archived" },
        membership: undefined,
      }),
    );

    const result = await createSdkCredential(transaction.db, {
      applicationId: "app-1",
      userId: "user-outside",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("rejects a member without administration permissions without inserting a credential", async () => {
    const transaction = makeTransactionDb(makeState({ membership: { role: "member" } }));

    const result = await createSdkCredential(transaction.db, {
      applicationId: "app-1",
      userId: "user-1",
    });

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("rejects a user without membership without inserting a credential", async () => {
    const transaction = makeTransactionDb(makeState({ membership: undefined }));

    const result = await createSdkCredential(transaction.db, {
      applicationId: "app-1",
      userId: "user-outside",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("checks membership inside the creation transaction so a demotion before commit blocks issuance", async () => {
    const state = makeState({ membership: { role: "admin" } });
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
    const transaction = makeTransactionDb(makeState({ application: undefined }));

    const result = await createSdkCredential(transaction.db, {
      applicationId: "missing",
      userId: "admin",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(transaction.values).not.toHaveBeenCalled();
  });
});

describe("revokeSdkCredential", () => {
  it("revokes an active credential for an administrator", async () => {
    const transaction = makeTransactionDb(
      makeState({
        membership: { role: "owner" },
        credential: { id: "cred-1", applicationId: "app-1", revokedAt: null },
      }),
    );

    const result = await revokeSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "admin",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credential.id).toBe("cred-1");
      expect(result.credential.applicationId).toBe("app-1");
      expect(new Date(result.credential.revokedAt).getTime()).not.toBeNaN();
    }
    expect(transaction.set).toHaveBeenCalledWith({ revokedAt: expect.any(Date) });
  });

  it("keeps a revoked credential revoked without touching workflows or models", async () => {
    const revokedAt = new Date("2026-09-01T00:00:00.000Z");
    const transaction = makeTransactionDb(
      makeState({
        credential: { id: "cred-1", applicationId: "app-1", revokedAt },
      }),
    );

    const result = await revokeSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "admin",
    });

    expect(result).toEqual({
      ok: true,
      credential: {
        id: "cred-1",
        applicationId: "app-1",
        revokedAt: "2026-09-01T00:00:00.000Z",
      },
    });
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("rejects a member without administration permissions keeping the credential active", async () => {
    const transaction = makeTransactionDb(
      makeState({
        membership: { role: "member" },
        credential: { id: "cred-1", applicationId: "app-1", revokedAt: null },
      }),
    );

    const result = await revokeSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "user-1",
    });

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it("rejects a user without membership without revealing the credential", async () => {
    const transaction = makeTransactionDb(
      makeState({
        membership: undefined,
        credential: { id: "cred-1", applicationId: "app-1", revokedAt: null },
      }),
    );

    const result = await revokeSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "user-outside",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it("returns not found when the credential does not belong to the application", async () => {
    const transaction = makeTransactionDb(makeState({ credential: undefined }));

    const result = await revokeSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-from-other-app",
      userId: "admin",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it("revokes credentials of an archived application", async () => {
    const transaction = makeTransactionDb(
      makeState({
        application: { id: "app-1", organizationId: "org-1", status: "archived" },
        credential: { id: "cred-1", applicationId: "app-1", revokedAt: null },
      }),
    );

    const result = await revokeSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "admin",
    });

    expect(result.ok).toBe(true);
    expect(transaction.set).toHaveBeenCalledWith({ revokedAt: expect.any(Date) });
  });

  it("checks membership inside the revocation transaction so a demotion before commit blocks it", async () => {
    const state = makeState({
      membership: { role: "admin" },
      credential: { id: "cred-1", applicationId: "app-1", revokedAt: null },
    });
    const transaction = makeTransactionDb(state);

    const allowed = await revokeSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "admin",
    });
    expect(allowed.ok).toBe(true);
    expect(state.updated).toHaveLength(1);

    state.membership = { role: "member" };
    state.updated = [];

    const other = makeTransactionDb(state);
    state.credential = { id: "cred-2", applicationId: "app-1", revokedAt: null };
    const demoted = await revokeSdkCredential(other.db, {
      applicationId: "app-1",
      credentialId: "cred-2",
      userId: "admin",
    });

    expect(demoted).toEqual({ ok: false, reason: "forbidden" });
    expect(state.updated).toHaveLength(0);
  });
});

describe("regenerateSdkCredential", () => {
  it("revokes the previous active credential and creates a new one with a new secret", async () => {
    const state = makeState({
      credential: { id: "cred-1", applicationId: "app-1", revokedAt: null },
    });
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

    expect(transaction.set).toHaveBeenCalledWith({
      revokedAt: expect.any(Date),
    });
    expect(transaction.values).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "app-1",
        prefix: expect.stringMatching(/^ayni_sk_/),
        secretHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });

  it("rejects a credential that is already revoked without modifying or inserting", async () => {
    const transaction = makeTransactionDb(
      makeState({
        credential: { id: "cred-1", applicationId: "app-1", revokedAt: new Date() },
      }),
    );

    const result = await regenerateSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "admin",
    });

    expect(result).toEqual({ ok: false, reason: "notActive" });
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("rejects a member without administration permissions, conserving the active credential", async () => {
    const transaction = makeTransactionDb(
      makeState({
        membership: { role: "member" },
        credential: { id: "cred-1", applicationId: "app-1", revokedAt: null },
      }),
    );

    const result = await regenerateSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "user-1",
    });

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("rejects an archived application before regenerating", async () => {
    const transaction = makeTransactionDb(
      makeState({
        application: { id: "app-1", organizationId: "org-1", status: "archived" },
        credential: { id: "cred-1", applicationId: "app-1", revokedAt: null },
      }),
    );

    const result = await regenerateSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "admin",
    });

    expect(result).toEqual({ ok: false, reason: "archived" });
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("returns not found when the credential does not exist", async () => {
    const transaction = makeTransactionDb(makeState({ credential: undefined }));

    const result = await regenerateSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "missing-cred",
      userId: "admin",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("returns not found when the application does not exist", async () => {
    const transaction = makeTransactionDb(makeState({ application: undefined }));

    const result = await regenerateSdkCredential(transaction.db, {
      applicationId: "missing",
      credentialId: "cred-1",
      userId: "admin",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("returns not found when the user is not a member", async () => {
    const transaction = makeTransactionDb(makeState({ membership: undefined }));

    const result = await regenerateSdkCredential(transaction.db, {
      applicationId: "app-1",
      credentialId: "cred-1",
      userId: "outside-user",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.values).not.toHaveBeenCalled();
  });

  it("checks membership inside the transaction so demotion before commit blocks issuance", async () => {
    const state = makeState({
      credential: { id: "cred-1", applicationId: "app-1", revokedAt: null },
    });
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

describe("verifySdkCredential", () => {
  function makeQueryDb(rows: Record<string, unknown>[]): CredentialQueryDatabase {
    return {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => rows,
          }),
        }),
      }),
    };
  }

  it("accepts an active credential secret", async () => {
    const secret = generateSdkCredentialSecret();
    const database = makeQueryDb([
      {
        id: "cred-1",
        applicationId: "app-1",
        secretHash: hashSdkCredentialSecret(secret),
        revokedAt: null,
      },
    ]);

    const result = await verifySdkCredential(database, secret);

    expect(result).toEqual({
      ok: true,
      credential: { credentialId: "cred-1", applicationId: "app-1" },
    });
  });

  it("rejects a revoked credential with the credentialRevoked state", async () => {
    const secret = generateSdkCredentialSecret();
    const database = makeQueryDb([
      {
        id: "cred-1",
        applicationId: "app-1",
        secretHash: hashSdkCredentialSecret(secret),
        revokedAt: new Date("2026-09-19T00:00:00.000Z"),
      },
    ]);

    const result = await verifySdkCredential(database, secret);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("credentialRevoked");
      expect(result.message).toBe(
        "La credencial fue revocada. Genera una nueva credencial para continuar.",
      );
    }
  });

  it("rejects an unknown secret", async () => {
    const database = makeQueryDb([]);

    const result = await verifySdkCredential(database, generateSdkCredentialSecret());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalidCredential");
  });
});

type FakeListState = {
  application: Record<string, unknown> | undefined;
  membership: Record<string, unknown> | undefined;
  credentials: Record<string, unknown>[];
  credentialSelectFields: (Record<string, unknown> & { secretHash?: unknown })[];
};

function makeListDb(state: FakeListState) {
  let selectCount = 0;
  const executor: ReadOnlyExecutor = {
    select: (fields: Record<string, unknown>) => ({
      from: (table: unknown) => {
        void table;
        return {
          where: async (condition: unknown) => {
            void condition;
            if (selectCount === 0) {
              selectCount += 1;
              return state.application ? [state.application] : [];
            }
            if (selectCount === 1) {
              selectCount += 1;
              return state.membership ? [state.membership] : [];
            }
            state.credentialSelectFields.push(
              fields as Record<string, unknown> & { secretHash?: unknown },
            );
            return state.credentials;
          },
        };
      },
    }),
  };

  return {
    db: {
      transaction: <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        selectCount = 0;
        return callback(executor);
      },
    },
  };
}

describe("listSdkCredentials", () => {
  const credentialRow = {
    id: "cred-1",
    applicationId: "app-1",
    prefix: "ayni_sk_abcd",
    createdAt: new Date("2026-09-18T12:00:00.000Z"),
  };

  it("returns operational metadata for an administrator without selecting the secret hash", async () => {
    const { db } = makeListDb({
      application: { id: "app-1", organizationId: "org-1" },
      membership: { role: "admin" },
      credentials: [credentialRow],
      credentialSelectFields: [],
    });

    const result = await listSdkCredentials(db, { applicationId: "app-1", userId: "admin" });

    expect(result).toEqual({ ok: true, credentials: [listedCredential] });
  });

  it("orders credentials from newest to oldest", async () => {
    const { db } = makeListDb({
      application: { id: "app-1", organizationId: "org-1" },
      membership: { role: "owner" },
      credentials: [
        { ...credentialRow, id: "cred-old", createdAt: new Date("2026-01-01T12:00:00.000Z") },
        credentialRow,
      ],
      credentialSelectFields: [],
    });

    const result = await listSdkCredentials(db, { applicationId: "app-1", userId: "admin" });

    expect(result.ok && result.credentials.map((item) => item.id)).toEqual(["cred-1", "cred-old"]);
  });

  it("returns an empty list for an application without credentials", async () => {
    const { db } = makeListDb({
      application: { id: "app-1", organizationId: "org-1" },
      membership: { role: "admin" },
      credentials: [],
      credentialSelectFields: [],
    });

    const result = await listSdkCredentials(db, { applicationId: "app-1", userId: "admin" });

    expect(result).toEqual({ ok: true, credentials: [] });
  });

  it("never selects the stored secret hash", async () => {
    const state: FakeListState = {
      application: { id: "app-1", organizationId: "org-1" },
      membership: { role: "owner" },
      credentials: [credentialRow],
      credentialSelectFields: [],
    };
    const { db } = makeListDb(state);

    await listSdkCredentials(db, { applicationId: "app-1", userId: "admin" });

    expect(state.credentialSelectFields.length).toBeGreaterThan(0);
    for (const fields of state.credentialSelectFields) {
      expect(fields).not.toHaveProperty("secretHash");
    }
  });

  it("rejects a member without administration permissions", async () => {
    const { db } = makeListDb({
      application: { id: "app-1", organizationId: "org-1" },
      membership: { role: "member" },
      credentials: [credentialRow],
      credentialSelectFields: [],
    });

    const result = await listSdkCredentials(db, { applicationId: "app-1", userId: "user-1" });

    expect(result).toEqual({ ok: false, reason: "forbidden" });
  });

  it("returns not found for a user outside the workspace without revealing credentials", async () => {
    const { db } = makeListDb({
      application: { id: "app-1", organizationId: "org-1" },
      membership: undefined,
      credentials: [credentialRow],
      credentialSelectFields: [],
    });

    const result = await listSdkCredentials(db, { applicationId: "app-1", userId: "user-outside" });

    expect(result).toEqual({ ok: false, reason: "notFound" });
  });

  it("returns not found when the application does not exist", async () => {
    const { db } = makeListDb({
      application: undefined,
      membership: { role: "admin" },
      credentials: [credentialRow],
      credentialSelectFields: [],
    });

    const result = await listSdkCredentials(db, { applicationId: "missing", userId: "admin" });

    expect(result).toEqual({ ok: false, reason: "notFound" });
  });

  it("marks a credential as revoked when it has a revokedAt date", async () => {
    const { db } = makeListDb({
      application: { id: "app-1", organizationId: "org-1" },
      membership: { role: "admin" },
      credentials: [{ ...credentialRow, revokedAt: new Date("2026-09-19T00:00:00.000Z") }],
      credentialSelectFields: [],
    });

    const result = await listSdkCredentials(db, { applicationId: "app-1", userId: "admin" });

    expect(result).toEqual({
      ok: true,
      credentials: [{ ...listedCredential, status: "revoked" }],
    });
  });

  it("lists credentials for archived applications so administrators keep managing them", async () => {
    const { db } = makeListDb({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: { role: "admin" },
      credentials: [credentialRow],
      credentialSelectFields: [],
    });

    const result = await listSdkCredentials(db, { applicationId: "app-1", userId: "admin" });

    expect(result).toEqual({ ok: true, credentials: [listedCredential] });
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
