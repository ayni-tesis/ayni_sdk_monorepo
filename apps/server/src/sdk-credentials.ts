import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";

import type { Application } from "./applications";
import type { CreateSdkCredentialResult } from "./sdk-credential-store";

export const SDK_CREDENTIAL_SECRET_PREFIX = "ayni_sk_";

export function generateSdkCredentialSecret() {
  return `${SDK_CREDENTIAL_SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashSdkCredentialSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

const APPLICATION_ARCHIVED_MESSAGE =
  "No puedes generar credenciales para una aplicación archivada.";

type Dependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  applications: {
    get: (id: string) => Promise<Application | undefined>;
    getMembership?: (userId: string, organizationId: string) => Promise<string | undefined>;
  };
  credentials: {
    create: (input: {
      applicationId: string;
      userId: string;
    }) => Promise<CreateSdkCredentialResult>;
    list?: (
      applicationId: string,
    ) => Promise<{ id: string; createdAt: string; lastUsedAt: string | null }[]>;
    authenticate?: (secret: string) => Promise<boolean>;
  };
};

export function createSdkCredentialsApp({ getSession, applications, credentials }: Dependencies) {
  const app = new Hono();

  app.get("/applications/:applicationId/sdk-credentials", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);
    const application = await applications.get(c.req.param("applicationId"));
    if (!application) return c.json({ message: "No encontramos esta aplicación." }, 404);
    const role = await applications.getMembership?.(session.user.id, application.organizationId);
    if (!role) return c.json({ message: "No tienes acceso a esta aplicación." }, 403);
    return c.json({ credentials: (await credentials.list?.(application.id)) ?? [] });
  });

  app.post("/applications/:applicationId/sdk-credentials", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (!application) return c.json({ message: "No encontramos esta aplicación." }, 404);

    const result = await credentials.create({
      applicationId: application.id,
      userId: session.user.id,
    });
    if (result.ok) return c.json({ credential: result.credential }, 201);
    if (result.reason === "forbidden") {
      return c.json({ message: "No tienes permiso para administrar credenciales." }, 403);
    }
    if (result.reason === "archived") {
      return c.json({ message: APPLICATION_ARCHIVED_MESSAGE, code: "applicationArchived" }, 409);
    }

    return c.json({ message: "No encontramos esta aplicación." }, 404);
  });

  app.post("/sdk/sync", async (c) => {
    const authorization = c.req.header("Authorization") ?? "";
    const match = /^Bearer (ayni_sk_[A-Za-z0-9_-]+)$/.exec(authorization);
    const secret = match?.[1];
    if (!secret || !(await credentials.authenticate?.(secret))) {
      return c.json({ message: "Credencial SDK inválida." }, 401);
    }
    return c.json({ authenticated: true });
  });

  return app;
}
