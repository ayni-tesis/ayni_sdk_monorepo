import { describe, expect, it } from "vitest";
import {
  DatasetAddEvidenceRequestSchema,
  DatasetAvailableEvidenceResponseSchema,
  DatasetCreateRequestSchema,
  DatasetDetailResponseSchema,
  DatasetListResponseSchema,
  DatasetPageQuerySchema,
} from "./datasets";
import { createOpenApiDocument } from "./index";

describe("dataset creation contract", () => {
  it("requires a nonblank name and a supported task type", () => {
    expect(
      DatasetCreateRequestSchema.safeParse({ name: "Flores", taskType: "classification" }).success,
    ).toBe(true);
    expect(
      DatasetCreateRequestSchema.safeParse({ name: "Detecciones", taskType: "detection" }).success,
    ).toBe(true);
    expect(
      DatasetCreateRequestSchema.safeParse({ name: "  ", taskType: "classification" }).success,
    ).toBe(false);
    expect(DatasetCreateRequestSchema.safeParse({ name: "Flores" }).success).toBe(false);
    expect(
      DatasetCreateRequestSchema.safeParse({ name: "Flores", taskType: "segmentation" }).success,
    ).toBe(false);
  });

  it("documents the administrator-only create endpoint", () => {
    const operation =
      createOpenApiDocument().paths?.["/applications/{applicationId}/datasets"]?.post;
    expect(operation?.responses?.["201"]).toBeDefined();
    expect(operation?.responses?.["403"]).toBeDefined();
    expect(operation?.responses?.["404"]).toBeDefined();
  });

  it("requires list responses to expose scoped dataset counts", () => {
    expect(
      DatasetListResponseSchema.safeParse({
        datasets: [
          {
            id: "dataset-1",
            applicationId: "app-1",
            name: "Flores",
            taskType: "classification",
            createdAt: "2026-10-01T00:00:00.000Z",
            evidenceCount: 4,
            approvedCount: 2,
          },
        ],
      }).success,
    ).toBe(true);
    expect(DatasetListResponseSchema.safeParse({ datasets: [{ id: "dataset-1" }] }).success).toBe(
      false,
    );
  });

  it("documents the member-readable list endpoint", () => {
    const operation =
      createOpenApiDocument().paths?.["/applications/{applicationId}/datasets"]?.get;
    expect(operation?.responses?.["200"]).toBeDefined();
    expect(operation?.responses?.["404"]).toBeDefined();
  });

  it("validates and documents the member-readable dataset detail", () => {
    const dataset = {
      id: "dataset-1",
      applicationId: "app-1",
      name: "Flores",
      taskType: "classification",
      createdAt: "2026-10-01T00:00:00.000Z",
      evidenceCount: 0,
      approvedCount: 0,
    };
    expect(
      DatasetDetailResponseSchema.safeParse({ dataset, items: [], nextItemOffset: null }).success,
    ).toBe(true);
    expect(DatasetDetailResponseSchema.safeParse({ dataset: { id: "dataset-1" } }).success).toBe(
      false,
    );
    const operation =
      createOpenApiDocument().paths?.["/applications/{applicationId}/datasets/{datasetId}"]?.get;
    expect(operation?.responses?.["200"]).toBeDefined();
    expect(operation?.responses?.["400"]).toBeDefined();
    expect(operation?.responses?.["404"]).toBeDefined();
    expect(
      operation?.parameters?.some(
        (parameter) => "name" in parameter && parameter.name === "offset",
      ),
    ).toBe(true);
  });

  it("validates evidence selection and documents available and add routes", () => {
    expect(DatasetAddEvidenceRequestSchema.safeParse({ evidenceIds: ["evidence-1"] }).success).toBe(
      true,
    );
    expect(DatasetAddEvidenceRequestSchema.safeParse({ evidenceIds: [] }).success).toBe(false);
    expect(
      DatasetAddEvidenceRequestSchema.safeParse({
        evidenceIds: Array.from({ length: 501 }, (_, index) => `evidence-${index}`),
      }).success,
    ).toBe(false);
    expect(
      DatasetAvailableEvidenceResponseSchema.safeParse({ evidence: [], nextOffset: null }).success,
    ).toBe(true);
    expect(DatasetPageQuerySchema.parse({ offset: "50" })).toEqual({ offset: 50 });
    expect(DatasetPageQuerySchema.safeParse({ offset: "-1" }).success).toBe(false);

    const document = createOpenApiDocument();
    const availableOperation =
      document.paths?.["/applications/{applicationId}/datasets/{datasetId}/available-evidence"]
        ?.get;
    expect(availableOperation?.responses?.["200"]).toBeDefined();
    expect(
      availableOperation?.parameters?.some(
        (parameter) => "name" in parameter && parameter.name === "offset",
      ),
    ).toBe(true);
    expect(
      document.paths?.["/applications/{applicationId}/datasets/{datasetId}/evidence"]?.post
        ?.responses?.["201"],
    ).toBeDefined();
  });
});
