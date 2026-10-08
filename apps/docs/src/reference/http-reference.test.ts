import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { apiDocumentPath, sdkContract } from "./http-reference";

describe("sdkContract", () => {
  it("keeps only the /sdk/* endpoints of the API document", () => {
    const document = JSON.parse(readFileSync(apiDocumentPath, "utf8"));

    expect(Object.keys(sdkContract(document).paths)).toEqual([
      "/sdk/consents",
      "/sdk/traces",
      "/sdk/traces/{traceId}/artifacts",
      "/sdk/traces/{traceId}/artifacts/{artifactId}/complete",
      "/sdk/telemetry-policy",
      "/sdk/collection-policy",
      "/sdk/evidence",
      "/sdk/evidence/{evidenceId}/complete",
      "/sdk/sync",
      "/sdk/workflow-versions/{workflowVersionId}",
      "/sdk/model-versions/{modelVersionId}/manifest",
      "/sdk/dataset-versions/{datasetVersionId}/manifest",
    ]);
  });

  it("leaves out session-authenticated dashboard routes and the health check", () => {
    const document = {
      openapi: "3.1.0",
      info: { title: "ayni API", version: "0.1.0" },
      paths: {
        "/health": { get: {} },
        "/applications/{applicationId}/sdk-credentials": { post: {} },
        "/sdk/sync": { post: {} },
      },
    };

    expect(sdkContract(document)).toEqual({ ...document, paths: { "/sdk/sync": { post: {} } } });
  });
});
