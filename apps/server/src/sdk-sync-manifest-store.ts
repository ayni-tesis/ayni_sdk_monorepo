import { model, modelVersion, workflow, workflowVersion } from "@ayni/db/schema/index";
import { and, desc, eq, inArray, ne } from "drizzle-orm";

export type SdkSyncWorkflow = {
  workflowId: string;
  workflowVersionId: string;
  name: string;
  version: string;
  modelVersionIds: string[];
};

export type SdkSyncModel = {
  modelVersionId: string;
  version: string;
  sha256: string;
};

export type SdkSyncManifest = {
  workflows: SdkSyncWorkflow[];
  models: SdkSyncModel[];
};

type WorkflowRow = { id: string; name: string };
type WorkflowVersionRow = {
  id: string;
  workflowId: string;
  version: string;
  definition: unknown;
  createdAt: Date | string;
};
type ModelRow = { id: string };
type ModelVersionRow = { id: string; version: string; sha256: string; modelId: string };

type SyncManifestDatabase = {
  select(fields: Record<string, unknown>): {
    from(table: unknown): {
      where(condition: unknown): {
        orderBy(column: unknown): Promise<Record<string, unknown>[]>;
      };
    };
  };
};

function modelVersionIdsFromDefinition(definition: unknown): string[] {
  if (!definition || typeof definition !== "object") return [];
  const nodes = (definition as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return [];

  return [
    ...new Set(
      nodes.flatMap((node) => {
        if (!node || typeof node !== "object") return [];
        const candidate = node as { type?: unknown; modelVersionId?: unknown };
        return candidate.type === "model.tflite" && typeof candidate.modelVersionId === "string"
          ? [candidate.modelVersionId]
          : [];
      }),
    ),
  ];
}

/**
 * Lists the latest immutable version of each non-archived workflow and its
 * application-owned model dependencies. Mutable drafts and storage details
 * never leave this query.
 */
export async function getSdkSyncManifest(
  database: SyncManifestDatabase,
  applicationId: string,
): Promise<SdkSyncManifest> {
  const workflows = (await database
    .select({ id: workflow.id, name: workflow.name })
    .from(workflow)
    .where(and(eq(workflow.applicationId, applicationId), ne(workflow.status, "archived")))
    .orderBy(workflow.createdAt)) as WorkflowRow[];
  if (workflows.length === 0) return { workflows: [], models: [] };

  const workflowIds = workflows.map(({ id }) => id);
  const versions = (await database
    .select({
      id: workflowVersion.id,
      workflowId: workflowVersion.workflowId,
      version: workflowVersion.version,
      definition: workflowVersion.definition,
      createdAt: workflowVersion.createdAt,
    })
    .from(workflowVersion)
    .where(inArray(workflowVersion.workflowId, workflowIds))
    .orderBy(desc(workflowVersion.createdAt))) as WorkflowVersionRow[];

  const latestVersionByWorkflow = new Map<string, WorkflowVersionRow>();
  for (const version of versions) {
    if (!latestVersionByWorkflow.has(version.workflowId)) {
      latestVersionByWorkflow.set(version.workflowId, version);
    }
  }

  const selected = workflows.flatMap((item) => {
    const version = latestVersionByWorkflow.get(item.id);
    return version
      ? [
          {
            workflow: item,
            version,
            modelVersionIds: modelVersionIdsFromDefinition(version.definition),
          },
        ]
      : [];
  });
  const dependencyIds = [...new Set(selected.flatMap((item) => item.modelVersionIds))];
  if (dependencyIds.length === 0) {
    return {
      workflows: selected.map(({ workflow: item, version }) => ({
        workflowId: item.id,
        workflowVersionId: version.id,
        name: item.name,
        version: version.version,
        modelVersionIds: [],
      })),
      models: [],
    };
  }

  const models = (await database
    .select({ id: model.id })
    .from(model)
    .where(eq(model.applicationId, applicationId))
    .orderBy(model.createdAt)) as ModelRow[];
  if (models.length === 0) {
    return {
      workflows: selected.map(({ workflow: item, version }) => ({
        workflowId: item.id,
        workflowVersionId: version.id,
        name: item.name,
        version: version.version,
        modelVersionIds: [],
      })),
      models: [],
    };
  }

  const modelVersions = (await database
    .select({
      id: modelVersion.id,
      modelId: modelVersion.modelId,
      version: modelVersion.version,
      sha256: modelVersion.sha256,
    })
    .from(modelVersion)
    .where(
      and(
        inArray(modelVersion.id, dependencyIds),
        inArray(
          modelVersion.modelId,
          models.map(({ id }) => id),
        ),
      ),
    )
    .orderBy(modelVersion.createdAt)) as ModelVersionRow[];
  const availableDependencyIds = new Set(modelVersions.map(({ id }) => id));

  return {
    workflows: selected.map(({ workflow: item, version, modelVersionIds }) => ({
      workflowId: item.id,
      workflowVersionId: version.id,
      name: item.name,
      version: version.version,
      modelVersionIds: modelVersionIds.filter((id) => availableDependencyIds.has(id)),
    })),
    models: modelVersions.map(({ id, version, sha256 }) => ({
      modelVersionId: id,
      version,
      sha256,
    })),
  };
}
