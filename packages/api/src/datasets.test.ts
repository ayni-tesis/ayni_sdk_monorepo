import { describe, expect, it } from "vitest";
import { DatasetCreateRequestSchema } from "./datasets";
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
});
