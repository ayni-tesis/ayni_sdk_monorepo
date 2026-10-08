import { application, dataset, datasetExport, datasetItem, member } from "@ayni/db/schema/index";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { unzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationDatabase } from "./application-actions";
import { createDatasetExport, validateDatasetForExport } from "./dataset-export-store";

const { readEvidenceMock, uploadFileMock } = vi.hoisted(() => ({
  readEvidenceMock: vi.fn(async (_key: string) => new Uint8Array([0xff, 0xd8])),
  uploadFileMock: vi.fn(async (..._args: unknown[]) => undefined),
}));
vi.mock("./lib/storage", () => ({
  getDownloadUrl: vi.fn(async (key: string) => `https://evidence.example/${key}`),
  uploadFile: uploadFileMock,
  deleteFile: vi.fn(async () => undefined),
}));
vi.mock("./evidence-storage", () => ({ r2EvidenceStorage: { read: readEvidenceMock } }));

afterEach(() => vi.clearAllMocks());

type ItemRow = {
  id: string;
  evidenceId: string;
  reviewStatus: "pending" | "approved" | "rejected";
  reviewedLabel: string | null;
  reviewedAnnotations: unknown;
  imageMediaType: string;
  imageByteSize: number;
  imageWidth: number;
  imageHeight: number;
  storageKey: string;
};

function itemRow(id: string, fields: Partial<ItemRow> = {}): ItemRow {
  return {
    id,
    evidenceId: `evidence-${id}`,
    reviewStatus: "approved",
    reviewedLabel: null,
    reviewedAnnotations: null,
    imageMediaType: "image/jpeg",
    imageByteSize: 1024,
    imageWidth: 640,
    imageHeight: 480,
    storageKey: `apps/app-1/evidence/${id}.jpg`,
    ...fields,
  };
}

/**
 * A database that answers each table with fixed rows and records every
 * select's `where`. It has no update or delete, and records any insert, so a
 * read-only operation that tried to write would fail or show up.
 */
function fakeDatabase({
  taskType = "classification",
  items = [] as ItemRow[],
  datasetFound = true,
}: {
  taskType?: string;
  items?: ItemRow[];
  datasetFound?: boolean;
} = {}) {
  const selects: { table: unknown; where?: { sql: string; params: unknown[] } }[] = [];
  const inserted: Record<string, unknown>[] = [];
  const tx = {
    select: () => ({
      from(table: unknown) {
        const record: (typeof selects)[number] = { table };
        selects.push(record);
        const rows: Record<string, unknown>[] =
          table === application
            ? [{ id: "app-1", organizationId: "org-1", name: "Ayni", status: "active" }]
            : table === member
              ? [{ role: "admin" }]
              : table === dataset
                ? datasetFound
                  ? [{ taskType }]
                  : []
                : table === datasetItem
                  ? items
                  : [];
        const query = Object.assign(Promise.resolve(rows), {
          innerJoin: (): unknown => query,
          where: (condition: SQL): unknown => {
            record.where = new PgDialect().sqlToQuery(condition);
            return query;
          },
          orderBy: (): unknown => query,
          limit: (): unknown => query,
          for: async () => rows,
        });
        return query;
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === datasetExport) inserted.push(values);
        return {
          returning: async () => [{ ...values, generatedAt: new Date("2026-10-07T00:00:00Z") }],
        };
      },
    }),
  };
  const database = {
    transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(tx),
  } as unknown as ApplicationDatabase;
  return { database, selects, inserted };
}

describe("validateDatasetForExport (US-084)", () => {
  it("confirms a dataset whose approved items all have their reviewed ground truth", async () => {
    const { database, selects } = fakeDatabase({
      items: [
        itemRow("item-1", { reviewedLabel: "pino" }),
        itemRow("item-2", { reviewedLabel: "cedro" }),
      ],
    });

    expect(await validateDatasetForExport(database, "app-1", "dataset-1")).toEqual({
      ready: true,
      approvedCount: 2,
      annotationCount: 0,
      categoryCount: 0,
      problem: null,
      invalidItemCount: 0,
      invalidItems: [],
    });
    const items = selects.find(({ table }) => table === datasetItem);
    expect(items?.where?.sql).toContain('"dataset_item"."application_id" = $1');
    expect(items?.where?.sql).toContain('"dataset_item"."dataset_id" = $2');
    expect(items?.where?.sql).toContain('"dataset_item"."review_status" = $3');
    expect(items?.where?.sql).toContain('"sdk_evidence"."status" = $4');
    expect(items?.where?.params).toEqual(["app-1", "dataset-1", "approved", "received"]);
  });

  it("identifies each invalid approved item with its image and cause, without writing", async () => {
    const { database, inserted } = fakeDatabase({
      taskType: "detection",
      items: [
        itemRow("item-1", { reviewedAnnotations: [] }),
        itemRow("item-2", { reviewedLabel: "gato" }),
        itemRow("item-3", { reviewStatus: "pending" }),
      ],
    });

    expect(await validateDatasetForExport(database, "app-1", "dataset-1")).toEqual({
      ready: false,
      approvedCount: 2,
      annotationCount: 0,
      categoryCount: 0,
      problem: null,
      invalidItemCount: 1,
      invalidItems: [
        {
          itemId: "item-2",
          evidenceId: "evidence-item-2",
          imageUrl: "https://evidence.example/apps/app-1/evidence/item-2.jpg",
          imageWidth: 640,
          imageHeight: 480,
          cause: {
            code: "reviewedAnnotationsRequired",
            message: "La evidencia aprobada no tiene anotaciones revisadas.",
          },
        },
      ],
    });
    expect(inserted).toEqual([]);
  });

  it("lists at most 100 invalid items but counts them all", async () => {
    const { database } = fakeDatabase({
      items: Array.from({ length: 101 }, (_, index) => itemRow(`item-${index + 1}`)),
    });

    const validation = await validateDatasetForExport(database, "app-1", "dataset-1");

    expect(validation?.invalidItemCount).toBe(101);
    expect(validation?.invalidItems).toHaveLength(100);
    expect(validation?.invalidItems[0]?.itemId).toBe("item-1");
  });

  it("reports a dataset without approved items", async () => {
    const { database } = fakeDatabase();

    expect(await validateDatasetForExport(database, "app-1", "dataset-1")).toEqual({
      ready: false,
      approvedCount: 0,
      annotationCount: 0,
      categoryCount: 0,
      problem: {
        code: "noApprovedItems",
        message: "El dataset no tiene evidencias aprobadas para exportar.",
      },
      invalidItemCount: 0,
      invalidItems: [],
    });
  });

  it("reads no items of a dataset outside the application", async () => {
    const { database, selects } = fakeDatabase({ datasetFound: false });

    expect(await validateDatasetForExport(database, "app-2", "dataset-1")).toBeNull();
    expect(selects.map(({ table }) => table)).toEqual([dataset]);
    expect(selects[0]?.where?.params).toEqual(["app-2", "dataset-1"]);
  });

  it("applies YOLO-only readiness rules and keeps the legacy detection default", async () => {
    const oneImage = itemRow("item-1", {
      reviewedAnnotations: [
        { label: "gato", box: { xMin: 0.25, yMin: 0.25, xMax: 0.75, yMax: 0.75 } },
      ],
    });
    const single = fakeDatabase({ taskType: "detection", items: [oneImage] });

    expect(
      await validateDatasetForExport(single.database, "app-1", "dataset-1", "detection_yolo"),
    ).toMatchObject({
      ready: false,
      problem: {
        code: "requiresMultipleItems",
        message: "Se necesitan al menos dos imágenes aprobadas para separar train y val.",
      },
    });
    expect(await validateDatasetForExport(single.database, "app-1", "dataset-1")).toMatchObject({
      ready: true,
      problem: null,
    });

    const noClasses = fakeDatabase({
      taskType: "detection",
      items: [
        itemRow("item-1", { reviewedAnnotations: [] }),
        itemRow("item-2", { reviewedAnnotations: [] }),
      ],
    });
    expect(
      await validateDatasetForExport(noClasses.database, "app-1", "dataset-1", "detection_yolo"),
    ).toMatchObject({
      ready: false,
      problem: {
        code: "noYoloClasses",
        message: "Agrega al menos una anotación revisada con una clase para exportar en YOLO.",
      },
    });
  });
});

describe("createDatasetExport checks (US-084, US-085)", () => {
  const input = { applicationId: "app-1", datasetId: "dataset-1", userId: "admin-1" };

  it.each([
    ["noApprovedItems", []],
    ["missingLabel", [itemRow("item-1", { reviewedLabel: "=x" }), itemRow("item-2")]],
    [
      "unsafeLabel",
      [itemRow("item-1", { reviewedLabel: "pino" }), itemRow("item-2", { reviewedLabel: "+1" })],
    ],
  ] as const)(
    "rejects with %s and stores nothing, as validation reports",
    async (reason, items) => {
      const { database, inserted } = fakeDatabase({ items: [...items] });

      expect(await createDatasetExport(database, input)).toEqual({ ok: false, reason });
      expect(uploadFileMock).not.toHaveBeenCalled();
      expect(inserted).toEqual([]);
      expect((await validateDatasetForExport(database, "app-1", "dataset-1"))?.ready).toBe(false);
    },
  );

  it("exports the approved items of a dataset that validation confirms", async () => {
    const { database, inserted } = fakeDatabase({
      items: [
        itemRow("item-1", { reviewedLabel: "pino" }),
        itemRow("item-2", { reviewedLabel: "cedro" }),
      ],
    });

    expect((await validateDatasetForExport(database, "app-1", "dataset-1"))?.ready).toBe(true);
    const result = await createDatasetExport(database, input);

    expect(result).toMatchObject({ ok: true, value: { version: 1, itemCount: 2 } });
    expect(readEvidenceMock.mock.calls.map(([key]) => key)).toEqual([
      "apps/app-1/evidence/item-1.jpg",
      "apps/app-1/evidence/item-2.jpg",
    ]);
    expect(inserted).toHaveLength(1);
  });

  it("writes a deterministic 80/20 YOLO archive with Spanish-sorted, escaped classes", async () => {
    const box = { xMin: 0.25, yMin: 0.25, xMax: 0.75, yMax: 0.75 };
    const items = [
      itemRow("item-5", { reviewedAnnotations: [] }),
      itemRow("item-4", { reviewedAnnotations: [{ label: "zapato", box }] }),
      itemRow("item-3", { reviewedAnnotations: [{ label: "ñandú", box }] }),
      itemRow("item-2", { reviewedAnnotations: [{ label: "árbol", box }] }),
      itemRow("item-1", { reviewedAnnotations: [{ label: 'a: "b"', box }] }),
    ];
    const { database } = fakeDatabase({ taskType: "detection", items });

    const result = await createDatasetExport(database, {
      ...input,
      format: "detection_yolo",
    });

    expect(result).toMatchObject({ ok: true, value: { itemCount: 5, format: "detection_yolo" } });
    const archive = uploadFileMock.mock.calls[0]?.[1] as Uint8Array;
    const files = unzipSync(archive);
    const decode = (path: string) => new TextDecoder().decode(files[path]);

    expect(Object.keys(files).sort()).toEqual([
      "data.yaml",
      "images/train/item-1.jpg",
      "images/train/item-2.jpg",
      "images/train/item-3.jpg",
      "images/train/item-4.jpg",
      "images/val/item-5.jpg",
      "labels/train/item-1.txt",
      "labels/train/item-2.txt",
      "labels/train/item-3.txt",
      "labels/train/item-4.txt",
      "labels/val/item-5.txt",
    ]);
    expect(decode("data.yaml")).toBe(
      [
        "train: images/train",
        "val: images/val",
        "names:",
        `  0: ${JSON.stringify('a: "b"')}`,
        `  1: ${JSON.stringify("árbol")}`,
        `  2: ${JSON.stringify("ñandú")}`,
        `  3: ${JSON.stringify("zapato")}`,
        "",
      ].join("\n"),
    );
    expect(decode("data.yaml")).not.toContain("path:");
    expect(decode("labels/train/item-1.txt")).toBe("0 0.5 0.5 0.5 0.5\n");
    expect(decode("labels/val/item-5.txt")).toBe("");
  });

  it.each([
    [
      "requiresMultipleItems",
      [
        itemRow("item-1", {
          reviewedAnnotations: [
            { label: "gato", box: { xMin: 0.25, yMin: 0.25, xMax: 0.75, yMax: 0.75 } },
          ],
        }),
      ],
    ],
    [
      "noYoloClasses",
      [
        itemRow("item-1", { reviewedAnnotations: [] }),
        itemRow("item-2", { reviewedAnnotations: [] }),
      ],
    ],
  ] as const)("rejects YOLO export with %s before storing an artifact", async (reason, items) => {
    const { database, inserted } = fakeDatabase({ taskType: "detection", items: [...items] });
    const yoloInput = { ...input, format: "detection_yolo" as const };

    expect(
      await validateDatasetForExport(database, "app-1", "dataset-1", yoloInput.format),
    ).toMatchObject({
      ready: false,
    });
    expect(await createDatasetExport(database, yoloInput)).toEqual({ ok: false, reason });
    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
  });
});
