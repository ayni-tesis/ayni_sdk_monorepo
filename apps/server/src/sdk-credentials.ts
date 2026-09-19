import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";

import type { Application } from "./applications";
import type {
  CreateSdkCredentialResult,
  ListSdkCredentialsResult,
  RevokeSdkCredentialResult,
} from "./sdk-credential-store";

export const SDK_CREDENTIAL_SECRET_PREFIX = "ayni_sk_";
export const SDK_CREDENTIAL_DISPLAY_PREFIX_LENGTH = 12;

export function generateSdkCredentialSecret() {
  return `${SDK_CREDENTIAL_SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function deriveSdkCredentialPrefix(secret: string) {
  return secret.slice(0, SDK_CREDENTIAL_DISPLAY_PREFIX_LENGTH);
}

export function hashSdkCredentialSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

const APPLICATION_ARCHIVED_MESSAGE =
  "No puedes generar credenciales para una aplicación archivada.";
const CREDENTIAL_FORBIDDEN_MESSAGE = "No tienes permiso para administrar credenciales.";
const CREDENTIAL_LIST_FORBIDDEN_MESSAGE =
  "No tienes permiso para ver las credenciales de esta aplicación.";
const CREDENTIAL_REVOKE_FORBIDDEN_MESSAGE = "No tienes permiso para revocar credenciales.";
const APPLICATION_NOT_FOUND_MESSAGE = "No encontramos esta aplicación.";

type Dependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  applications: {
    get: (id: string) => Promise<Application | undefined>;
  };
  credentials: {
    create: (input: {
      applicationId: string;
      userId: string;
    }) => Promise<CreateSdkCredentialResult>;
    list: (input: { applicationId: string; userId: string }) => Promise<ListSdkCredentialsResult>;
    revoke: (input: {
      applicationId: string;
      credentialId: string;
      userId: string;
    }) => Promise<RevokeSdkCredentialResult>;
  };
};

export function createSdkCredentialsApp({ getSession, applications, credentials }: Dependencies) {
  const app = new Hono();

  app.get("/applications/:applicationId/sdk-credentials", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (!application) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);

    const result = await credentials.list({
      applicationId: application.id,
      userId: session.user.id,
    });
    if (result.ok) return c.json({ credentials: result.credentials });
    if (result.reason === "forbidden") {
      return c.json({ message: CREDENTIAL_LIST_FORBIDDEN_MESSAGE }, 403);
    }

    return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
  });

  app.post("/applications/:applicationId/sdk-credentials", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (!application) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);

    const result = await credentials.create({
      applicationId: application.id,
      userId: session.user.id,
    });
    if (result.ok) return c.json({ credential: result.credential }, 201);
    if (result.reason === "forbidden") {
      return c.json({ message: CREDENTIAL_FORBIDDEN_MESSAGE }, 403);
    }
    if (result.reason === "archived") {
      return c.json({ message: APPLICATION_ARCHIVED_MESSAGE, code: "applicationArchived" }, 409);
    }

    return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
  });

  app.post("/applications/:applicationId/sdk-credentials/:credentialId/revoke", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (!application) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);

    const result = await credentials.revoke({
      applicationId: application.id,
      credentialId: c.req.param("credentialId"),
      userId: session.user.id,
    });
    if (result.ok) return c.json({ credential: result.credential });
    if (result.reason === "forbidden") {
      return c.json({ message: CREDENTIAL_REVOKE_FORBIDDEN_MESSAGE }, 403);
    }

    return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
  });

  return app;
}
