import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";

import type { Application } from "./applications";

export type CreatedSdkCredential = {
  id: string;
  applicationId: string;
  secret: string;
};

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
    getMembership: (userId: string, organizationId: string) => Promise<string | undefined>;
    get: (id: string) => Promise<Application | undefined>;
  };
  credentials: {
    create: (input: { applicationId: string }) => Promise<CreatedSdkCredential | undefined>;
  };
};

export function createSdkCredentialsApp({ getSession, applications, credentials }: Dependencies) {
  const app = new Hono();

  app.post("/applications/:applicationId/sdk-credentials", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (!application) return c.json({ message: "No encontramos esta aplicación." }, 404);

    const role = await applications.getMembership(session.user.id, application.organizationId);
    if (role !== "admin" && role !== "owner") {
      return c.json({ message: "No tienes permiso para administrar credenciales." }, 403);
    }

    if (application.status === "archived") {
      return c.json({ message: APPLICATION_ARCHIVED_MESSAGE, code: "applicationArchived" }, 409);
    }

    const credential = await credentials.create({ applicationId: application.id });
    if (!credential) {
      return c.json({ message: APPLICATION_ARCHIVED_MESSAGE, code: "applicationArchived" }, 409);
    }

    return c.json({ credential }, 201);
  });

  return app;
}
