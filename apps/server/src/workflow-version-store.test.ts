import { application, member, workflow, workflowVersion } from "@ayni/db/schema/index";
import { describe, expect, it } from "vitest";

import type { WorkflowDatabase, WorkflowDraft } from "./workflow-store";
import {
  getSdkWorkflowVersionDefinition,
  publishWorkflowVersion,
  type SdkWorkflowVersionDefinition,
} from "./workflow-version-store";

const publishableDraft: WorkflowDraft = {
  nodes: [
    { id: "input", type: "input.image", outputs: { imagen: "image" } },
    {
      id: "classifier",
      type: "model.tflite",
      modelVersionId: "version-1",
      modelName: "Clasificador",
      version: "1.0.0",
      inputs: {
        image: {
          type: "image",
          width: 224,
          height: 224,
          channels: 3,
          normalization: "zero_to_one",
        },
      },
      outputs: { result: { type: "classification", labels: ["sana"] } },
    },
    {
      id: "diagnosis",
      type: "output",
      name: "Diagnóstico",
      sourceNodeId: "classifier",
      sourcePort: "result",
      resultType: "classification",
    },
  ],
  connections: [
    {
      sourceNodeId: "input",
      sourcePort: "imagen",
      targetNodeId: "classifier",
      targetPort: "image",
    },
  ],
  layout: { input: { x: 0, y: 0 } },
};

function makePublishDb({
  role = "admin",
  status = "active",
  draft = publishableDraft,
  existingVersions = [] as string[],
}: {
  role?: string;
  status?: string;
  draft?: WorkflowDraft | null;
  existingVersions?: string[];
} = {}) {
  const versions = existingVersions.map((version, index) => ({
    id: `existing-${index}`,
    workflowId: "workflow-1",
    version,
  }));
  const inserted: Record<string, unknown>[] = [];
  const lockedTables: unknown[] = [];
  const executor = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () => ({
            for: async () => {
              lockedTables.push(table);
              if (table === application)
                return [{ id: "app-1", organizationId: "org-1", name: "Cámara", status }];
              if (table === member) return [{ role }];
              if (table === workflow) return draft ? [{ draft: structuredClone(draft) }] : [];
              if (table === workflowVersion) return versions;
              return [];
            },
          }),
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (value: Record<string, unknown>) => ({
        returning: async () => {
          expect(table).toBe(workflowVersion);
          const row = { ...value, createdAt: new Date("2026-09-24T12:00:00.000Z") };
          inserted.push(row);
          return [row];
        },
      }),
    }),
  };
  const db: WorkflowDatabase = { transaction: (callback) => callback(executor) };
  return { db, inserted, lockedTables };
}

const input = {
  applicationId: "app-1",
  workflowId: "workflow-1",
  userId: "admin",
  version: "1.0.0",
};

describe("publishWorkflowVersion", () => {
  it("stores the validated DAG of the locked draft as an immutable version", async () => {
    const store = makePublishDb();

    const result = await publishWorkflowVersion(store.db, input);

    expect(result).toEqual({
      ok: true,
      version: {
        id: expect.any(String),
        workflowId: "workflow-1",
        version: "1.0.0",
        createdAt: "2026-09-24T12:00:00.000Z",
      },
    });
    expect(store.inserted).toEqual([
      {
        id: expect.any(String),
        workflowId: "workflow-1",
        version: "1.0.0",
        definition: { nodes: publishableDraft.nodes, connections: publishableDraft.connections },
        publishedById: "admin",
        createdAt: expect.any(Date),
      },
    ]);
    expect(store.lockedTables).toContain(workflow);
  });

  it("rejects a draft that is not publishable with its validation errors, without creating a version", async () => {
    const store = makePublishDb({ draft: { ...publishableDraft, connections: [] } });

    const result = await publishWorkflowVersion(store.db, input);

    expect(result).toMatchObject({ ok: false, reason: "invalidDraft" });
    expect(result.ok === false && result.reason === "invalidDraft" && result.errors).toContainEqual(
      expect.objectContaining({ code: "requiredInput", nodeId: "classifier", port: "image" }),
    );
    expect(store.inserted).toHaveLength(0);
  });

  it("rejects a version identifier already used by the workflow, keeping the existing versions", async () => {
    const store = makePublishDb({ existingVersions: ["1.0.0"] });

    const result = await publishWorkflowVersion(store.db, input);

    expect(result).toEqual({ ok: false, reason: "versionExists" });
    expect(store.inserted).toHaveLength(0);
  });

  it("lets only administrators and owners of an active application publish", async () => {
    const plainMember = makePublishDb({ role: "member" });
    const archived = makePublishDb({ status: "archived" });
    const owner = makePublishDb({ role: "owner" });

    expect(await publishWorkflowVersion(plainMember.db, input)).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(await publishWorkflowVersion(archived.db, input)).toEqual({
      ok: false,
      reason: "archived",
    });
    expect((await publishWorkflowVersion(owner.db, input)).ok).toBe(true);
    expect(plainMember.inserted).toHaveLength(0);
    expect(archived.inserted).toHaveLength(0);
  });

  it("returns workflowNotFound for a workflow outside the application", async () => {
    const store = makePublishDb({ draft: null });

    expect(await publishWorkflowVersion(store.db, input)).toEqual({
      ok: false,
      reason: "workflowNotFound",
    });
    expect(store.inserted).toHaveLength(0);
  });
});

const publishedDefinition: SdkWorkflowVersionDefinition = {
  nodes: [{ id: "input", type: "input.image" }],
  connections: [],
};

function makeSdkDefinitionDatabase({
  applicationRow = { id: "app-1", status: "active" },
  versionRow = { workflowId: "workflow-1", definition: publishedDefinition },
  workflowRow = { id: "workflow-1", applicationId: "app-1", status: "draft" },
}: {
  applicationRow?: { id: string; status: string } | undefined;
  versionRow?: { workflowId: string; definition: SdkWorkflowVersionDefinition } | null;
  workflowRow?: { id: string; applicationId: string; status: string } | undefined;
} = {}) {
  const lockedTables: { table: unknown; strength: "update" | "share" }[] = [];
  const executor = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () => ({
            for: async (strength: "update" | "share") => {
              lockedTables.push({ table, strength });
              if (table === application) {
                return applicationRow?.id === "app-1" && applicationRow.status === "active"
                  ? [applicationRow]
                  : [];
              }
              if (table === workflowVersion) return versionRow ? [versionRow] : [];
              if (table === workflow) {
                return workflowRow &&
                  workflowRow.id === versionRow?.workflowId &&
                  workflowRow.applicationId === "app-1" &&
                  workflowRow.status !== "archived"
                  ? [workflowRow]
                  : [];
              }
              return [];
            },
          }),
        }),
      }),
    }),
  };
  return {
    lockedTables,
    db: {
      transaction: <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(executor),
    },
  };
}

describe("getSdkWorkflowVersionDefinition", () => {
  it("returns only a published definition owned by an available workflow and application", async () => {
    const { db, lockedTables } = makeSdkDefinitionDatabase();

    await expect(getSdkWorkflowVersionDefinition(db, "app-1", "version-1")).resolves.toEqual({
      ok: true,
      definition: publishedDefinition,
    });
    expect(lockedTables).toEqual([
      { table: application, strength: "share" },
      { table: workflowVersion, strength: "share" },
      { table: workflow, strength: "share" },
    ]);
  });

  it.each([
    ["is missing", { versionRow: null }],
    [
      "belongs to another application",
      { workflowRow: { id: "workflow-1", applicationId: "app-2", status: "draft" } },
    ],
    [
      "belongs to an archived workflow",
      { workflowRow: { id: "workflow-1", applicationId: "app-1", status: "archived" } },
    ],
    ["belongs to an archived application", { applicationRow: { id: "app-1", status: "archived" } }],
  ])("does not expose a definition that %s", async (_description, rows) => {
    const { db } = makeSdkDefinitionDatabase(rows);

    await expect(getSdkWorkflowVersionDefinition(db, "app-1", "version-1")).resolves.toEqual({
      ok: false,
      reason: "notFound",
    });
  });
});
