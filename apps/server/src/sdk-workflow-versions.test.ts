import { describe, expect, it, vi } from "vitest";
import {
  SDK_CREDENTIAL_REVOKED_MESSAGE,
  type VerifySdkCredentialResult,
} from "./sdk-credential-store";
import {
  createSdkWorkflowVersionsApp,
  WORKFLOW_VERSION_NOT_FOUND_MESSAGE,
} from "./sdk-workflow-versions";
import type {
  GetSdkWorkflowVersionDefinitionResult,
  SdkWorkflowVersionDefinition,
} from "./workflow-version-store";

const SECRET = "ayni_sk_abcd1234rest-of-secret";
const definition: SdkWorkflowVersionDefinition = {
  nodes: [{ id: "input", type: "input.image" }],
  connections: [],
};

function makeApp({
  verify = async (): Promise<VerifySdkCredentialResult> => ({
    ok: true,
    credential: { credentialId: "cred-1", applicationId: "app-1" },
  }),
  getDefinition = async (): Promise<GetSdkWorkflowVersionDefinitionResult> => ({
    ok: true,
    definition,
  }),
}: {
  verify?: (secret: string) => Promise<VerifySdkCredentialResult>;
  getDefinition?: (
    applicationId: string,
    workflowVersionId: string,
  ) => Promise<GetSdkWorkflowVersionDefinitionResult>;
} = {}) {
  const verifyMock = vi.fn(verify);
  const getDefinitionMock = vi.fn(getDefinition);
  return {
    app: createSdkWorkflowVersionsApp({
      credentials: { verify: verifyMock },
      workflowVersions: { getDefinition: getDefinitionMock },
    }),
    verifyMock,
    getDefinitionMock,
  };
}

const VERSION_URL = "/sdk/workflow-versions/version-1";

describe("GET /sdk/workflow-versions/:workflowVersionId", () => {
  it("returns the immutable definition to an active credential of the owning application", async () => {
    const { app, verifyMock, getDefinitionMock } = makeApp();

    const response = await app.request(VERSION_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${SECRET}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(definition);
    expect(verifyMock).toHaveBeenCalledWith(SECRET);
    expect(getDefinitionMock).toHaveBeenCalledWith("app-1", "version-1");
  });

  it.each([undefined, "Bearer invalid", "Bearerayni_sk_abcd1234rest-of-secret"])(
    "rejects malformed credentials without querying workflow versions",
    async (authorization) => {
      const { app, verifyMock, getDefinitionMock } = makeApp();

      const response = await app.request(VERSION_URL, {
        method: "GET",
        headers: authorization ? { Authorization: authorization } : {},
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ code: "invalidCredential" });
      expect(verifyMock).not.toHaveBeenCalled();
      expect(getDefinitionMock).not.toHaveBeenCalled();
    },
  );

  it("rejects a revoked credential without delivering a workflow", async () => {
    const { app, getDefinitionMock } = makeApp({
      verify: async () => ({
        ok: false,
        code: "credentialRevoked",
        message: SDK_CREDENTIAL_REVOKED_MESSAGE,
      }),
    });

    const response = await app.request(VERSION_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${SECRET}` },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: SDK_CREDENTIAL_REVOKED_MESSAGE,
      code: "credentialRevoked",
    });
    expect(getDefinitionMock).not.toHaveBeenCalled();
  });

  it("uses one not-found response for unavailable workflow versions", async () => {
    const { app } = makeApp({
      getDefinition: async () => ({ ok: false, reason: "notFound" }),
    });

    const response = await app.request(VERSION_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${SECRET}` },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: WORKFLOW_VERSION_NOT_FOUND_MESSAGE,
      code: "workflowVersionNotFound",
    });
  });
});
