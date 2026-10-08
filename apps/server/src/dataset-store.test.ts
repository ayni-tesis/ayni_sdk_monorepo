import type { DatasetTaskType } from "@ayni/api/datasets";
import {
  application,
  dataset,
  datasetItem,
  member,
  sdkEvidence,
  user,
} from "@ayni/db/schema/index";
import type { SQL } from "drizzle-orm";
import { PgDialect, QueryBuilder } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationDatabase } from "./application-actions";
import {
  addDatasetEvidence,
  getDataset,
  listAvailableDatasetEvidence,
  listDatasets,
  removeDatasetEvidence,
  reviewDatasetEvidence,
  saveDatasetItemAnnotations,
  saveDatasetItemLabel,
} from "./dataset-store";
import { logger } from "./lib/logger";

vi.mock("./lib/storage", () => ({
  getDownloadUrl: vi.fn(async (key: string) => `https://evidence.example/${key}`),
}));

afterEach(() => vi.restoreAllMocks());

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
  storageKey: "apps/app-1/evidence/evidence-1.jpg",
  imageWidth: 640,
  imageHeight: 480,
};

type EvidenceRow = Omit<typeof evidence, "taskType"> & { taskType: DatasetTaskType };

function makeDatabase({
  evidenceRows = [evidence],
  attachedRows = [] as { evidenceId: string }[],
  datasetItemRows = [] as Record<string, unknown>[],
  deleteRows = [{ id: "item-1" }] as Record<string, unknown>[],
  membershipRole = "admin",
}: {
  evidenceRows?: EvidenceRow[];
  attachedRows?: { evidenceId: string }[];
  datasetItemRows?: Record<string, unknown>[];
  deleteRows?: Record<string, unknown>[];
  membershipRole?: string;
} = {}) {
  const insertedValues: Record<string, unknown>[] = [];
  const deletedTables: unknown[] = [];
  const updatedValues: Record<string, unknown>[] = [];
  const tx = {
    select: () => ({
      from(table: unknown) {
        const rows: Record<string, unknown>[] =
          table === application
            ? [{ id: "app-1", organizationId: "org-1", name: "Ayni", status: "active" }]
            : table === member
              ? [{ role: membershipRole }]
              : table === user
                ? [{ name: "Diego" }]
                : table === dataset
                  ? [
                      {
                        id: "dataset-1",
                        applicationId: "app-1",
                        name: "Flores",
                        taskType: "classification",
                        createdAt: new Date("2026-10-01T00:00:00.000Z"),
                        evidenceCount: 3,
                        approvedCount: 1,
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
            groupBy: () => makeQuery(resultRows),
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
    delete: (table: unknown) => {
      deletedTables.push(table);
      return {
        where: () => ({ returning: async () => deleteRows }),
      };
    },
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updatedValues.push(values);
        return {
          where: () => ({
            returning: async () => [{ id: "item-1", ...values }],
          }),
        };
      },
    }),
  };
  const database = {
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as ApplicationDatabase;
  return { database, deletedTables, insertedValues, updatedValues };
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
      imageUrl: `https://evidence.example/${evidence.storageKey}`,
      reviewStatus: "pending",
      reviewedAnnotations: null,
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

describe("removeDatasetEvidence", () => {
  it("deletes only the dataset item association", async () => {
    const { database, deletedTables } = makeDatabase();

    expect(await removeDatasetEvidence(database, { ...input, itemId: "item-1" })).toEqual({
      ok: true,
    });
    expect(deletedTables).toEqual([datasetItem]);
  });

  it("reports an item that does not belong to the dataset as not found", async () => {
    const { database, deletedTables } = makeDatabase({ deleteRows: [] });

    expect(await removeDatasetEvidence(database, { ...input, itemId: "foreign-item" })).toEqual({
      ok: false,
      reason: "notFound",
    });
    expect(deletedTables).toEqual([datasetItem]);
  });

  it("logs transaction failures with the error and dataset operation identifiers", async () => {
    const failure = new Error("database unavailable");
    const database = {
      transaction: async () => {
        throw failure;
      },
    } as unknown as ApplicationDatabase;
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    expect(await removeDatasetEvidence(database, { ...input, itemId: "item-1" })).toEqual({
      ok: false,
      reason: "databaseFailed",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      {
        err: failure,
        applicationId: input.applicationId,
        datasetId: input.datasetId,
        itemId: "item-1",
      },
      "Failed to remove dataset evidence",
    );
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
      storageKey: `apps/app-1/evidence/evidence-${index + 1}.jpg`,
      imageWidth: 640,
      imageHeight: 480,
      reviewStatus: index === 0 ? "approved" : "pending",
      reviewerName: index === 0 ? "Diego" : null,
      reviewedAt: index === 0 ? new Date("2026-10-03T00:00:00.000Z") : null,
      reviewReason: null,
    }));
    const { database } = makeDatabase({ datasetItemRows });

    const firstPage = await getDataset(database, "app-1", "dataset-1");
    expect(firstPage?.dataset.evidenceCount).toBe(3);
    expect(firstPage?.dataset.approvedCount).toBe(1);
    expect(firstPage?.items).toHaveLength(50);
    expect(firstPage?.items[0]).toMatchObject({
      imageUrl: "https://evidence.example/apps/app-1/evidence/evidence-1.jpg",
      reviewStatus: "approved",
      reviewerName: "Diego",
      reviewedAt: "2026-10-03T00:00:00.000Z",
    });
    expect(firstPage?.nextItemOffset).toBe(50);

    const secondPage = await getDataset(database, "app-1", "dataset-1", 50);
    expect(secondPage?.items).toHaveLength(1);
    expect(secondPage?.nextItemOffset).toBeNull();
  });
});

/**
 * A transaction that answers each `select` with the next result set and keeps
 * its table and `where` condition, rendered as Postgres SQL.
 */
function recordingDatabase(results: Record<string, unknown>[][]) {
  const selects: { table: unknown; where?: { sql: string; params: unknown[] } }[] = [];
  const tx = {
    select: () => ({
      from(table: unknown) {
        const record: (typeof selects)[number] = { table };
        selects.push(record);
        const rows = results[selects.length - 1] ?? [];
        const query = Object.assign(Promise.resolve(rows), {
          innerJoin: (): unknown => query,
          leftJoin: (): unknown => query,
          where: (condition: SQL): unknown => {
            record.where = new PgDialect().sqlToQuery(condition);
            return query;
          },
          groupBy: (): unknown => query,
          orderBy: (): unknown => query,
          limit: (): unknown => query,
          offset: async () => rows,
        });
        return query;
      },
    }),
  };
  const database = {
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as ApplicationDatabase;
  return { database, selects };
}

describe("dataset evidence counts", () => {
  /**
   * Renders the dataset query as Postgres runs it: selecting from `dataset`
   * alone, so drizzle drops the table of every column in its SQL fields.
   */
  async function renderedDatasetQuery(read: (database: ApplicationDatabase) => Promise<unknown>) {
    let fields: Record<string, unknown> | undefined;
    const tx = {
      select(selection: Record<string, unknown>) {
        fields ??= selection;
        const query = Object.assign(Promise.resolve([]), {
          from: (): unknown => query,
          where: (): unknown => query,
          orderBy: (): unknown => query,
          limit: (): unknown => query,
        });
        return query;
      },
    };
    await read({
      transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as ApplicationDatabase);
    if (!fields) throw new Error("The dataset was not selected");
    return new QueryBuilder()
      .select(fields as Parameters<QueryBuilder["select"]>[0])
      .from(dataset)
      .toSQL().sql;
  }

  it.each([
    ["listDatasets", (database: ApplicationDatabase) => listDatasets(database, "app-1")],
    ["getDataset", (database: ApplicationDatabase) => getDataset(database, "app-1", "dataset-1")],
  ])("%s counts the items of each dataset, not of every item", async (_name, read) => {
    const sql = await renderedDatasetQuery(read);
    const itemsOfDataset =
      '"dataset_item"."application_id" = "dataset"."application_id" and "dataset_item"."dataset_id" = "dataset"."id"';

    expect(sql).toContain(`(select count(*)::int from "dataset_item" where ${itemsOfDataset})`);
    expect(sql).toContain(
      `(select count(*)::int from "dataset_item" where ${itemsOfDataset} and "dataset_item"."review_status" = 'approved')`,
    );
  });
});

describe("getDataset filters (US-083)", () => {
  const datasetRow = (taskType: DatasetTaskType) => ({
    id: "dataset-1",
    applicationId: "app-1",
    name: "Flores",
    taskType,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    evidenceCount: 2,
    approvedCount: 1,
  });
  const itemRow = {
    id: "item-1",
    evidenceId: "evidence-1",
    modelId: "model-1",
    modelVersion: "1.0.0",
    taskType: "classification",
    originalResult: evidence.result,
    capturedAt: new Date("2026-10-02T00:00:00.000Z"),
    addedAt: new Date("2026-10-02T00:00:00.000Z"),
    storageKey: "apps/app-1/evidence/evidence-1.jpg",
    imageWidth: 640,
    imageHeight: 480,
    reviewStatus: "approved",
    reviewerName: "Diego",
    reviewedAt: new Date("2026-10-03T00:00:00.000Z"),
    reviewReason: null,
    reviewedLabel: null,
    reviewedAnnotations: null,
  };

  it("applies every filter to the requested dataset's items before paginating", async () => {
    const { database, selects } = recordingDatabase([
      [datasetRow("classification")],
      Array.from({ length: 51 }, (_, index) => ({ ...itemRow, id: `item-${index + 1}` })),
      [{ id: "workflow-1", name: "Inspección" }],
      [{ id: "model-1", name: "Flores v1" }],
    ]);

    const page = await getDataset(database, "app-1", "dataset-1", 50, {
      status: "approved",
      workflowId: "workflow-1",
      modelId: "model-1",
      capturedFrom: "2026-10-01",
      capturedTo: "2026-10-03",
      minConfidence: 0.5,
      maxConfidence: 0.9,
    });

    expect(page?.items).toHaveLength(50);
    expect(page?.nextItemOffset).toBe(100);
    expect(page?.dataset.evidenceCount).toBe(2);
    const items = selects[1];
    expect(items?.table).toBe(datasetItem);
    expect(items?.where?.sql).toContain('"dataset_item"."application_id" = $1');
    expect(items?.where?.sql).toContain('"dataset_item"."dataset_id" = $2');
    expect(items?.where?.sql).toContain('"dataset_item"."review_status" = $3');
    expect(items?.where?.sql).toContain('"sdk_evidence"."workflow_id" = $4');
    expect(items?.where?.sql).toContain('"sdk_evidence"."model_id" = $5');
    expect(items?.where?.sql).toContain('"sdk_evidence"."captured_at" >= $6');
    expect(items?.where?.sql).toContain('"sdk_evidence"."captured_at" < $7');
    expect(items?.where?.sql).toContain('jsonb_path_query("dataset_item"."original_result"');
    expect(items?.where?.params).toEqual([
      "app-1",
      "dataset-1",
      "approved",
      "workflow-1",
      "model-1",
      "2026-10-01T00:00:00.000Z",
      "2026-10-04T00:00:00.000Z",
      '$.confidence ? (@.type() == "number")',
      0.5,
      '$.confidence ? (@.type() == "number")',
      0.9,
    ]);
  });

  it("reads a detection's confidence as the highest of its detections", async () => {
    const { database, selects } = recordingDatabase([[datasetRow("detection")], [], [], []]);

    await getDataset(database, "app-1", "dataset-1", 0, { minConfidence: 0.7 });

    expect(selects[1]?.where?.sql).toContain("select max(");
    expect(selects[1]?.where?.params).toEqual([
      "app-1",
      "dataset-1",
      '$.detections[*].confidence ? (@.type() == "number")',
      0.7,
    ]);
  });

  it("offers the workflows and models of the whole dataset, whatever the filters", async () => {
    const { database, selects } = recordingDatabase([
      [datasetRow("classification")],
      [],
      [{ id: "workflow-1", name: "Inspección" }],
      [
        { id: "model-1", name: "Flores v1" },
        { id: "model-deleted", name: "model-deleted" },
      ],
    ]);

    const page = await getDataset(database, "app-1", "dataset-1", 0, { status: "rejected" });

    expect(page?.items).toEqual([]);
    expect(page?.filterOptions).toEqual({
      workflows: [{ id: "workflow-1", name: "Inspección" }],
      models: [
        { id: "model-1", name: "Flores v1" },
        { id: "model-deleted", name: "model-deleted" },
      ],
    });
    for (const options of selects.slice(2)) {
      expect(options.table).toBe(datasetItem);
      expect(options.where?.params).toEqual(["app-1", "dataset-1"]);
    }
  });

  it("queries nothing else for a dataset outside the application", async () => {
    const { database, selects } = recordingDatabase([[]]);

    expect(await getDataset(database, "app-2", "dataset-1", 0, { status: "pending" })).toBeNull();
    expect(selects).toHaveLength(1);
  });
});

describe("reviewDatasetEvidence", () => {
  it("stores the review status, reviewer, timestamp, and optional reason for any member", async () => {
    const { database, updatedValues } = makeDatabase({ membershipRole: "member" });
    const result = await reviewDatasetEvidence(database, {
      applicationId: "app-1",
      datasetId: "dataset-1",
      itemId: "item-1",
      userId: "reviewer-1",
      status: "rejected",
      reason: "Imagen borrosa",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      status: "rejected",
      reviewerName: "Diego",
      reason: "Imagen borrosa",
    });
    const reviewedAt = updatedValues[0]?.reviewedAt;
    expect(reviewedAt).toBeInstanceOf(Date);
    if (!(reviewedAt instanceof Date)) return;
    expect(result.value.reviewedAt).toBe(reviewedAt.toISOString());
    expect(updatedValues[0]).toMatchObject({
      reviewStatus: "rejected",
      reviewedBy: "reviewer-1",
      reviewReason: "Imagen borrosa",
    });
  });

  it("clears a rejection reason when evidence is approved", async () => {
    const { database, updatedValues } = makeDatabase();
    const result = await reviewDatasetEvidence(database, {
      applicationId: "app-1",
      datasetId: "dataset-1",
      itemId: "item-1",
      userId: "reviewer-1",
      status: "approved",
      reason: "ignored",
    });

    expect(result).toMatchObject({ ok: true, value: { status: "approved", reason: null } });
    expect(updatedValues[0]?.reviewReason).toBeNull();
  });
});

describe("saveDatasetItemLabel", () => {
  const labelInput = {
    applicationId: "app-1",
    datasetId: "dataset-1",
    itemId: "item-1",
    userId: "member-1",
    label: "cedro",
  };

  it("stores the reviewed label for any member without touching the original prediction", async () => {
    const { database, updatedValues } = makeDatabase({
      membershipRole: "member",
      datasetItemRows: [{ id: "item-1", taskType: "classification" }],
    });

    expect(await saveDatasetItemLabel(database, labelInput)).toEqual({
      ok: true,
      value: { reviewedLabel: "cedro" },
    });
    expect(updatedValues).toEqual([{ reviewedLabel: "cedro" }]);
  });

  it("refuses detection items and items outside the dataset without writing", async () => {
    const detection = makeDatabase({
      datasetItemRows: [{ id: "item-1", taskType: "detection" }],
    });
    expect(await saveDatasetItemLabel(detection.database, labelInput)).toEqual({
      ok: false,
      reason: "notClassification",
    });
    expect(detection.updatedValues).toEqual([]);

    const missing = makeDatabase();
    expect(await saveDatasetItemLabel(missing.database, labelInput)).toEqual({
      ok: false,
      reason: "notFound",
    });
    expect(missing.updatedValues).toEqual([]);
  });

  it("logs transaction failures", async () => {
    const failure = new Error("database unavailable");
    const database = {
      transaction: async () => {
        throw failure;
      },
    } as unknown as ApplicationDatabase;
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    expect(await saveDatasetItemLabel(database, labelInput)).toEqual({
      ok: false,
      reason: "databaseFailed",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      { err: failure, applicationId: "app-1", datasetId: "dataset-1", itemId: "item-1" },
      "Failed to save dataset item label",
    );
  });
});

describe("saveDatasetItemAnnotations", () => {
  const annotations = [
    { label: "gato", box: { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.6 } },
    { label: "perro", box: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 } },
  ];
  const annotationsInput = {
    applicationId: "app-1",
    datasetId: "dataset-1",
    itemId: "item-1",
    userId: "member-1",
    annotations,
  };

  it("stores the reviewed boxes for any member without touching the original prediction", async () => {
    const { database, updatedValues } = makeDatabase({
      membershipRole: "member",
      datasetItemRows: [{ id: "item-1", taskType: "detection" }],
    });

    expect(await saveDatasetItemAnnotations(database, annotationsInput)).toEqual({
      ok: true,
      value: { reviewedAnnotations: annotations },
    });
    expect(updatedValues).toEqual([{ reviewedAnnotations: annotations }]);
  });

  it("stores an empty list when the image shows no object", async () => {
    const { database, updatedValues } = makeDatabase({
      datasetItemRows: [{ id: "item-1", taskType: "detection" }],
    });

    expect(
      await saveDatasetItemAnnotations(database, { ...annotationsInput, annotations: [] }),
    ).toEqual({ ok: true, value: { reviewedAnnotations: [] } });
    expect(updatedValues).toEqual([{ reviewedAnnotations: [] }]);
  });

  it("refuses classification items and items outside the dataset without writing", async () => {
    const classification = makeDatabase({
      datasetItemRows: [{ id: "item-1", taskType: "classification" }],
    });
    expect(await saveDatasetItemAnnotations(classification.database, annotationsInput)).toEqual({
      ok: false,
      reason: "notDetection",
    });
    expect(classification.updatedValues).toEqual([]);

    const missing = makeDatabase();
    expect(await saveDatasetItemAnnotations(missing.database, annotationsInput)).toEqual({
      ok: false,
      reason: "notFound",
    });
    expect(missing.updatedValues).toEqual([]);
  });

  it("logs transaction failures", async () => {
    const failure = new Error("database unavailable");
    const database = {
      transaction: async () => {
        throw failure;
      },
    } as unknown as ApplicationDatabase;
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    expect(await saveDatasetItemAnnotations(database, annotationsInput)).toEqual({
      ok: false,
      reason: "databaseFailed",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      { err: failure, applicationId: "app-1", datasetId: "dataset-1", itemId: "item-1" },
      "Failed to save dataset item annotations",
    );
  });
});
