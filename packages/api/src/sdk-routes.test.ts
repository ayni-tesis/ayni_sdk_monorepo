import { describe, expect, it } from "vitest";

import { sdkRouteDrift, sdkRoutesInSource } from "./sdk-routes";

describe("sdkRouteDrift", () => {
  const document = {
    paths: {
      "/health": { get: {} },
      "/sdk/sync": { post: {} },
      "/sdk/consents": { post: {} },
      "/sdk/workflow-versions/{workflowVersionId}": { get: {}, parameters: [] },
    },
  };

  it("finds nothing when the server and the specification agree on the /sdk/* routes", () => {
    const routes = [
      { method: "POST", path: "/sdk/sync" },
      { method: "POST", path: "/sdk/consents" },
      { method: "GET", path: "/sdk/workflow-versions/{workflowVersionId}" },
    ];

    expect(sdkRouteDrift(routes, document)).toEqual({ undocumented: [], unimplemented: [] });
  });

  it("reports server routes missing from the specification and specified routes the server lacks", () => {
    const routes = [
      { method: "GET", path: "/sdk/sync" },
      { method: "GET", path: "/sdk/workflow-versions/{workflowVersionId}" },
      { method: "DELETE", path: "/sdk/models/{modelId}" },
    ];

    expect(sdkRouteDrift(routes, document)).toEqual({
      undocumented: [
        { method: "GET", path: "/sdk/sync" },
        { method: "DELETE", path: "/sdk/models/{modelId}" },
      ],
      unimplemented: [
        { method: "POST", path: "/sdk/sync" },
        { method: "POST", path: "/sdk/consents" },
      ],
    });
  });
});

describe("sdkRoutesInSource", () => {
  it("finds the /sdk/* routes a Hono app declares, with OpenAPI path parameters", () => {
    const source = `
      const app = new Hono();
      app.get("/applications/:applicationId", handler);
      app.get("/sdk/workflow-versions/:workflowVersionId", async (c) => c.json({}));
      app.post(
        "/sdk/sync",
        handler,
      );
      app.post("/sdk/consents", handler);
    `;

    expect(sdkRoutesInSource(source)).toEqual([
      { method: "GET", path: "/sdk/workflow-versions/{workflowVersionId}" },
      { method: "POST", path: "/sdk/sync" },
      { method: "POST", path: "/sdk/consents" },
    ]);
  });

  it("finds routes declared for several methods with on() or for every method with all()", () => {
    const source = `
      app.on(["GET", "post"], "/sdk/a", handler);
      app.on("PUT", "/sdk/b/:id{[0-9]+}", handler);
      app.all("/sdk/c", handler);
    `;

    expect(sdkRoutesInSource(source)).toEqual([
      { method: "GET", path: "/sdk/a" },
      { method: "POST", path: "/sdk/a" },
      { method: "PUT", path: "/sdk/b/{id}" },
      { method: "ALL", path: "/sdk/c" },
    ]);
  });
});
