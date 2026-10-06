import type { DatasetTaskType } from "@ayni/api/datasets";
import { application, dataset, datasetItem, member, sdkEvidence } from "@ayni/db/schema/index";
import { describe, expect, it } from "vitest";
import type { ApplicationDatabase } from "./application-actions";
import {
  addDatasetEvidence,
  getDataset,
  listAvailableDatasetEvidence,
  listDatasets,
} from "./dataset-store";

const input = {
  applicationId: "app-1",
  datasetId: "dataset-1",
  evidenceIds: ["evidence-1"],
  userId: "admin-1",
};

const evidence = {
  evidenceId: "evidence-1",
  modelId: "model-1",
  modelVersion: "1.0.0",
  taskType: "classification" as const,
  result: { type: "classification", label: "pino", confidence: 0.8 },
  capturedAt: new Date("2026-10-01T00:00:00.000Z"),
  status: "received",
};

type EvidenceRow = Omit<typeof evidence, "taskType"> & { taskType: DatasetTaskType };

function makeDatabase({
  evidenceRows = [evidence],
  attachedRows = [] as { evidenceId: string }[],
  datasetItemRows = [] as Record<string, unknown>[],
}: {
  evidenceRows?: EvidenceRow[];
  attachedRows?: { evidenceId: string }[];
  datasetItemRows?: Record<string, unknown>[];
} = {}) {
  const insertedValues: Record<string, unknown>[] = [];
  const tx = {
    select: () => ({
      from(table: unknown) {
        const rows: Record<string, unknown>[] =
          table === application
            ? [{ id: "app-1", organizationId: "org-1", name: "Ayni", status: "active" }]
            : table === member
              ? [{ role: "admin" }]
              : table === dataset
                ? [
                    {
                      id: "dataset-1",
                      applicationId: "app-1",
                      name: "Flores",
                      taskType: "classification",
                      createdAt: new Date("2026-10-01T00:00:00.000Z"),
                      evidenceCount: 3,
                    },
                  ]
                : table === sdkEvidence
                  ? evidenceRows
                  : table === datasetItem
                    ? datasetItemRows.length > 0
                      ? datasetItemRows
                      : attachedRows
                    : [];
        const makeQuery = (resultRows: Record<string, unknown>[]) =>
          Object.assign(Promise.resolve(resultRows), {
            leftJoin: () =>
              makeQuery(
                table === sdkEvidence
                  ? resultRows.filter(
                      (row) =>
                        !attachedRows.some((attached) => attached.evidenceId === row.evidenceId),
                    )
                  : resultRows,
              ),
            innerJoin: () => makeQuery(resultRows),
            where: () => makeQuery(resultRows),
            orderBy: () => makeQuery(resultRows),
            limit: (count: number) => makeQuery(resultRows.slice(0, count)),
            offset: async (count: number) => resultRows.slice(count),
            for: async () => resultRows,
          });
        return makeQuery(rows);
      },
    }),
    insert: () => ({
      values: (values: Record<string, unknown>[]) => {
        insertedValues.push(...values);
        return {
          returning: async () =>
            values.map(({ id, evidenceId, originalResult, addedAt }) => ({
              id,
              evidenceId,
              originalResult,
              addedAt,
            })),
        };
      },
    }),
  };
  const database = {
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as ApplicationDatabase;
  return { database, insertedValues };
}

describe("addDatasetEvidence", () => {
  it("stores the prediction snapshot for received evidence", async () => {
    const { database, insertedValues } = makeDatabase();
    const result = await addDatasetEvidence(database, input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toMatchObject({
      evidenceId: evidence.evidenceId,
      originalResult: evidence.result,
      taskType: evidence.taskType,
    });
    expect(insertedValues[0]).toMatchObject({
      applicationId: input.applicationId,
      datasetId: input.datasetId,
      evidenceId: evidence.evidenceId,
      originalResult: evidence.result,
    });
  });

  it("rejects mixed task types before inserting any evidence", async () => {
    const mismatch = { ...evidence, evidenceId: "evidence-2", taskType: "detection" as const };
    const { database, insertedValues } = makeDatabase({ evidenceRows: [evidence, mismatch] });
    const result = await addDatasetEvidence(database, {
      ...input,
      evidenceIds: ["evidence-1", "evidence-2"],
    });

    expect(result).toEqual({ ok: false, reason: "incompatible" });
    expect(insertedValues).toEqual([]);
  });

  it("refuses evidence outside the application, duplicates, and pending uploads", async () => {
    const foreign = makeDatabase({ evidenceRows: [] });
    expect(await addDatasetEvidence(foreign.database, input)).toEqual({
      ok: false,
      reason: "notFound",
    });

    const duplicate = makeDatabase();
    expect(
      await addDatasetEvidence(duplicate.database, {
        ...input,
        evidenceIds: ["evidence-1", "evidence-1"],
      }),
    ).toEqual({ ok: false, reason: "alreadyAdded" });
    expect(duplicate.insertedValues).toEqual([]);

    const pending = makeDatabase({ evidenceRows: [{ ...evidence, status: "awaitingUpload" }] });
    expect(await addDatasetEvidence(pending.database, input)).toEqual({
      ok: false,
      reason: "notFound",
    });
    expect(pending.insertedValues).toEqual([]);
  });

  it("refuses evidence already linked to the same dataset", async () => {
    const { database, insertedValues } = makeDatabase({
      attachedRows: [{ evidenceId: "evidence-1" }],
    });
    expect(await addDatasetEvidence(database, input)).toEqual({
      ok: false,
      reason: "alreadyAdded",
    });
    expect(insertedValues).toEqual([]);
  });
});

describe("dataset evidence pages", () => {
  it("counts items in the dataset query and returns available evidence in pages", async () => {
    const evidenceRows = Array.from({ length: 51 }, (_, index) => ({
      ...evidence,
      evidenceId: `evidence-${index + 1}`,
    }));
    const { database } = makeDatabase({ evidenceRows });

    const datasets = await listDatasets(database, "app-1");
    expect(datasets.datasets[0]?.evidenceCount).toBe(3);

    const firstPage = await listAvailableDatasetEvidence(database, "app-1", "dataset-1");
    expect(firstPage?.evidence).toHaveLength(50);
    expect(firstPage?.nextOffset).toBe(50);

    const secondPage = await listAvailableDatasetEvidence(database, "app-1", "dataset-1", 50);
    expect(secondPage?.evidence).toHaveLength(1);
    expect(secondPage?.nextOffset).toBeNull();
  });

  it("returns dataset items in pages with the total evidence count", async () => {
    const datasetItemRows = Array.from({ length: 51 }, (_, index) => ({
      id: `item-${index + 1}`,
      evidenceId: `evidence-${index + 1}`,
      modelId: "model-1",
      modelVersion: "1.0.0",
      taskType: "classification",
      originalResult: evidence.result,
      capturedAt: new Date("2026-10-01T00:00:00.000Z"),
      addedAt: new Date("2026-10-02T00:00:00.000Z"),
    }));
    const { database } = makeDatabase({ datasetItemRows });

    const firstPage = await getDataset(database, "app-1", "dataset-1");
    expect(firstPage?.dataset.evidenceCount).toBe(3);
    expect(firstPage?.items).toHaveLength(50);
    expect(firstPage?.nextItemOffset).toBe(50);

    const secondPage = await getDataset(database, "app-1", "dataset-1", 50);
    expect(secondPage?.items).toHaveLength(1);
    expect(secondPage?.nextItemOffset).toBeNull();
  });
});
