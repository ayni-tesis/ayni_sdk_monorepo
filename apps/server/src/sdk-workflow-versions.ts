import { Hono } from "hono";
import { INVALID_CREDENTIAL_MESSAGE, type VerifySdkCredentialResult } from "./sdk-credential-store";
import type { GetSdkWorkflowVersionDefinitionResult } from "./workflow-version-store";

type Dependencies = {
  credentials: { verify: (secret: string) => Promise<VerifySdkCredentialResult> };
  workflowVersions: {
    getDefinition: (
      applicationId: string,
      workflowVersionId: string,
    ) => Promise<GetSdkWorkflowVersionDefinitionResult>;
  };
};

const WORKFLOW_VERSION_NOT_FOUND_MESSAGE = "El workflow ya no está disponible.";

/** Creates the SDK endpoint for downloading an immutable published workflow definition. */
export function createSdkWorkflowVersionsApp({ credentials, workflowVersions }: Dependencies) {
  const app = new Hono();

  app.get("/sdk/workflow-versions/:workflowVersionId", async (c) => {
    const bearer = /^bearer +(\S+)$/i.exec(c.req.header("Authorization") ?? "");
    const secret = bearer?.[1];
    if (!secret || !/^ayni_sk_[A-Za-z0-9_-]+$/.test(secret)) {
      return c.json({ message: INVALID_CREDENTIAL_MESSAGE, code: "invalidCredential" }, 401);
    }

    const verified = await credentials.verify(secret);
    if (verified.ok === false) {
      return c.json({ message: verified.message, code: verified.code }, 401);
    }

    const result = await workflowVersions.getDefinition(
      verified.credential.applicationId,
      c.req.param("workflowVersionId"),
    );
    if (result.ok === false) {
      return c.json(
        { message: WORKFLOW_VERSION_NOT_FOUND_MESSAGE, code: "workflowVersionNotFound" },
        404,
      );
    }

    return c.json(result.definition);
  });

  return app;
}

export { WORKFLOW_VERSION_NOT_FOUND_MESSAGE };
