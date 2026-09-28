import { describe, expect, it } from "vitest";
import { parseChangelog } from "./changelog";
import { compatibilityRows, nodeTypeLink } from "./compatibility";

const releases = parseChangelog(
  ["1.0.0", "0.2.0", "0.1.0-beta.1"]
    .map((version) => `## ${version} - 2026-09-28\n\n### Novedades\n\n- Uno.\n`)
    .join("\n"),
);

const since = { "input.image": "0.1.0-beta.1", output: "0.1.0-beta.1", crop: "0.2.0" };

describe("compatibilityRows", () => {
  it("gives each version its server, its workflow schema and the node types it accepts", () => {
    const rows = compatibilityRows(
      releases,
      {
        "1.0.0": { minimumServer: "0.3.0", workflowSchema: "1" },
        "0.2.0": { minimumServer: "0.2.0", workflowSchema: null },
        "0.1.0-beta.1": { minimumServer: "0.1.0", workflowSchema: null },
      },
      since,
    );

    expect(rows).toEqual([
      {
        sdk: "1.0.0",
        minimumServer: "0.3.0",
        workflowSchema: "1",
        nodeTypes: ["input.image", "output", "crop"],
      },
      {
        sdk: "0.2.0",
        minimumServer: "0.2.0",
        workflowSchema: null,
        nodeTypes: ["input.image", "output", "crop"],
      },
      {
        sdk: "0.1.0-beta.1",
        minimumServer: "0.1.0",
        workflowSchema: null,
        nodeTypes: ["input.image", "output"],
      },
    ]);
  });

  it("fails for a version without compatibility data", () => {
    expect(() =>
      compatibilityRows(
        releases,
        { "1.0.0": { minimumServer: "0.1.0", workflowSchema: null } },
        since,
      ),
    ).toThrow("Declare the compatibility of ayni_sdk 0.2.0 in src/resources/compatibility.ts.");
  });
});

describe("nodeTypeLink", () => {
  it("links to the node type's heading in Esquema de workflow, whose slug drops every dot", () => {
    expect(nodeTypeLink("model.tflite")).toBe("/referencia/esquema-de-workflow/#modeltflite");
    expect(nodeTypeLink("a.b.c")).toBe("/referencia/esquema-de-workflow/#abc");
  });
});
