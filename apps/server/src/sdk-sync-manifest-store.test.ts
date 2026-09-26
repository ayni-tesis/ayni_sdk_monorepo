import { describe, expect, it } from "vitest";

import { getSdkSyncManifest } from "./sdk-sync-manifest-store";

function makeDatabase(rows: Record<string, unknown>[][]) {
  let index = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: async () => rows[index++] ?? [],
        }),
      }),
    }),
  };
}

describe("getSdkSyncManifest", () => {
  it("uses the latest published version of each non-archived workflow and its own model dependencies", async () => {
    const manifest = await getSdkSyncManifest(
      makeDatabase([
        [{ status: "active" }],
        [{ id: "workflow-1", name: "Clasificar hoja" }],
        [
          {
            id: "workflow-version-new",
            workflowId: "workflow-1",
            version: "2.0.0",
            createdAt: new Date("2026-09-20"),
            definition: {
              nodes: [
                { type: "input.image" },
                { type: "model.tflite", modelVersionId: "model-version-1" },
                { type: "model.tflite", modelVersionId: "model-version-1" },
              ],
            },
          },
          {
            id: "workflow-version-old",
            workflowId: "workflow-1",
            version: "1.0.0",
            createdAt: new Date("2026-09-01"),
            definition: { nodes: [{ type: "model.tflite", modelVersionId: "old-model-version" }] },
          },
        ],
        [{ id: "model-1" }],
        [
          {
            id: "model-version-1",
            modelId: "model-1",
            version: "3.0.0",
            sha256: "b".repeat(64),
          },
        ],
      ]),
      "application-1",
    );

    expect(manifest).toEqual({
      workflows: [
        {
          workflowId: "workflow-1",
          workflowVersionId: "workflow-version-new",
          name: "Clasificar hoja",
          version: "2.0.0",
          modelVersionIds: ["model-version-1"],
        },
      ],
      models: [{ modelVersionId: "model-version-1", version: "3.0.0", sha256: "b".repeat(64) }],
    });
  });

  it("does not return resources for an archived application", async () => {
    const manifest = await getSdkSyncManifest(
      makeDatabase([[{ status: "archived" }]]),
      "application-1",
    );

    expect(manifest).toEqual({ workflows: [], models: [] });
  });

  it("keeps a published workflow without model nodes while skipping model queries", async () => {
    const manifest = await getSdkSyncManifest(
      makeDatabase([
        [{ status: "active" }],
        [{ id: "workflow-1", name: "Validar imagen" }],
        [
          {
            id: "workflow-version-1",
            workflowId: "workflow-1",
            version: "1.0.0",
            createdAt: new Date("2026-09-20"),
            definition: { nodes: [{ type: "input.image" }, { type: "output" }] },
          },
        ],
      ]),
      "application-1",
    );

    expect(manifest).toEqual({
      workflows: [
        {
          workflowId: "workflow-1",
          workflowVersionId: "workflow-version-1",
          name: "Validar imagen",
          version: "1.0.0",
          modelVersionIds: [],
        },
      ],
      models: [],
    });
  });

  it.each(["missing-model-version", "foreign-model-version"])(
    "omits a workflow whose dependency is unavailable to the application (%s)",
    async (modelVersionId) => {
      const manifest = await getSdkSyncManifest(
        makeDatabase([
          [{ status: "active" }],
          [
            { id: "workflow-with-model", name: "Clasificar hoja" },
            { id: "workflow-without-model", name: "Validar imagen" },
          ],
          [
            {
              id: "workflow-version-with-model",
              workflowId: "workflow-with-model",
              version: "1.0.0",
              createdAt: new Date("2026-09-20"),
              definition: { nodes: [{ type: "model.tflite", modelVersionId }] },
            },
            {
              id: "workflow-version-without-model",
              workflowId: "workflow-without-model",
              version: "1.0.0",
              createdAt: new Date("2026-09-20"),
              definition: { nodes: [{ type: "input.image" }, { type: "output" }] },
            },
          ],
          [{ id: "owned-model" }],
          [],
        ]),
        "application-1",
      );

      expect(manifest).toEqual({
        workflows: [
          {
            workflowId: "workflow-without-model",
            workflowVersionId: "workflow-version-without-model",
            name: "Validar imagen",
            version: "1.0.0",
            modelVersionIds: [],
          },
        ],
        models: [],
      });
    },
  );
});
