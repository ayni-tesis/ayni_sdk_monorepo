import { describe, expect, it, vi } from "vitest";

import type { Application } from "./applications";
import {
  type CreateSdkCredentialResult,
  createSdkCredential,
  type TransactionExecutor,
} from "./sdk-credential-store";
import {
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
}: {
  session?: { user: { id: string } } | null;
  application?: Application | null;
  create?: (input: { applicationId: string; userId: string }) => Promise<CreateSdkCredentialResult>;
} = {}) {
  const createMock = vi.fn(create);
  return {
    create: createMock,
    request: createSdkCredentialsApp({
      getSession: async () => session,
      applications: {
        get: async () => application ?? undefined,
      },
      credentials: { create: createMock },
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

type FakeTransactionState = {
  application: Record<string, unknown> | undefined;
  membership: Record<string, unknown> | undefined;
  inserted: Record<string, unknown>[];
};

function makeTransactionDb(state: FakeTransactionState) {
  const values = vi.fn((value: Record<string, unknown>) => {
    const row = { id: "cred-1", applicationId: value.applicationId };
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
