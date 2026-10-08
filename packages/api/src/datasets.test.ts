import { describe, expect, it } from "vitest";
import {
  checkDatasetForExport,
  DatasetAddEvidenceRequestSchema,
  DatasetAnnotationsResponseSchema,
  DatasetAvailableEvidenceResponseSchema,
  DatasetCreateRequestSchema,
  DatasetDetailResponseSchema,
  DatasetItemSchema,
  DatasetLabelRequestSchema,
  DatasetLabelResponseSchema,
  DatasetListResponseSchema,
  DatasetPageQuerySchema,
  DatasetReviewRequestSchema,
  DatasetReviewResponseSchema,
  DatasetValidationResponseSchema,
  parseDatasetAnnotationsRequest,
  parseDatasetItemsQuery,
  parseDatasetValidationQuery,
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
      DatasetDetailResponseSchema.safeParse({
        dataset,
        items: [],
        nextItemOffset: null,
        filterOptions: {
          workflows: [{ id: "workflow-1", name: "Inspección" }],
          models: [{ id: "model-1", name: "Flores v1" }],
        },
      }).success,
    ).toBe(true);
    expect(
      DatasetDetailResponseSchema.safeParse({ dataset, items: [], nextItemOffset: null }).success,
    ).toBe(false);
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

  it("parses every dataset evidence filter together with the page offset (US-083)", () => {
    expect(
      parseDatasetItemsQuery({
        offset: "50",
        status: "pending",
        workflowId: "workflow-1",
        modelId: "model-1",
        capturedFrom: "2026-10-01",
        capturedTo: "2026-10-03",
        minConfidence: "0.25",
        maxConfidence: "0.9",
      }),
    ).toEqual({
      success: true,
      data: {
        offset: 50,
        status: "pending",
        workflowId: "workflow-1",
        modelId: "model-1",
        capturedFrom: "2026-10-01",
        capturedTo: "2026-10-03",
        minConfidence: 0.25,
        maxConfidence: 0.9,
      },
    });
    expect(parseDatasetItemsQuery({})).toEqual({ success: true, data: { offset: 0 } });
    expect(
      parseDatasetItemsQuery({ capturedFrom: "2026-10-01", capturedTo: "2026-10-01" }).success,
    ).toBe(true);
    expect(parseDatasetItemsQuery({ minConfidence: "0", maxConfidence: "1" }).success).toBe(true);
  });

  it("rejects unknown and invalid filters with one message, apart from a bad page offset", () => {
    const filterError = {
      success: false,
      error: { code: "invalidDatasetFilter", message: "No se pudo aplicar uno de los filtros." },
    };
    for (const query of [
      { label: "pino" } as Record<string, string>,
      { status: "archived" },
      { workflowId: "" },
      { modelId: "x".repeat(129) },
      { capturedFrom: "2026-02-30" },
      { capturedTo: "ayer" },
      { capturedFrom: "2026-10-03", capturedTo: "2026-10-01" },
      { minConfidence: "" },
      { minConfidence: "-0.1" },
      { maxConfidence: "1.5" },
      { maxConfidence: "alta" },
      { minConfidence: "0.8", maxConfidence: "0.2" },
      { offset: "-1", status: "archived" },
    ]) {
      expect(parseDatasetItemsQuery(query), JSON.stringify(query)).toEqual(filterError);
    }
    expect(parseDatasetItemsQuery({ offset: "-1" })).toEqual({
      success: false,
      error: { code: "invalidDatasetPage", message: "El desplazamiento de página no es válido." },
    });
  });

  it("documents the dataset evidence filters and their invalid-filter response", () => {
    const operation =
      createOpenApiDocument().paths?.["/applications/{applicationId}/datasets/{datasetId}"]?.get;
    const parameters = (operation?.parameters ?? []).flatMap((parameter) =>
      "name" in parameter ? [parameter] : [],
    );
    expect(parameters.map((parameter) => parameter.name)).toEqual([
      "applicationId",
      "datasetId",
      "offset",
      "status",
      "workflowId",
      "modelId",
      "capturedFrom",
      "capturedTo",
      "minConfidence",
      "maxConfidence",
    ]);
    for (const name of ["minConfidence", "maxConfidence"]) {
      const confidence = parameters.find((parameter) => parameter.name === name);
      expect(JSON.stringify(confidence)).toContain("detección");
      expect(confidence?.schema).toMatchObject({ type: "number", minimum: 0, maximum: 1 });
      expect(confidence?.schema).not.toHaveProperty("minLength");
    }
    expect(JSON.stringify(operation?.responses?.["400"])).toContain(
      "No se pudo aplicar uno de los filtros.",
    );
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
    const removalOperation =
      document.paths?.["/applications/{applicationId}/datasets/{datasetId}/evidence/{itemId}"]
        ?.delete;
    expect(removalOperation?.responses?.["204"]).toBeDefined();
    expect(removalOperation?.responses?.["403"]).toBeDefined();
    expect(removalOperation?.responses?.["404"]).toBeDefined();
  });

  it("validates review states, image metadata, and review audit fields", () => {
    const item = {
      id: "item-1",
      evidenceId: "evidence-1",
      modelId: "model-1",
      modelVersion: "1.0.0",
      taskType: "classification",
      originalResult: { type: "classification", label: "pino", confidence: 0.9 },
      capturedAt: "2026-10-01T00:00:00.000Z",
      addedAt: "2026-10-02T00:00:00.000Z",
      imageUrl: "https://evidence.example/image",
      imageWidth: 640,
      imageHeight: 480,
      reviewStatus: "rejected",
      reviewerName: "Diego",
      reviewedAt: "2026-10-03T00:00:00.000Z",
      reviewReason: "Imagen borrosa",
      reviewedLabel: null,
      reviewedAnnotations: null,
    };
    expect(DatasetItemSchema.safeParse(item).success).toBe(true);
    expect(
      DatasetReviewRequestSchema.safeParse({ status: "rejected", reason: "Imagen borrosa" })
        .success,
    ).toBe(true);
    expect(DatasetReviewRequestSchema.safeParse({ status: "pending" }).success).toBe(false);
    expect(
      DatasetReviewResponseSchema.safeParse({
        status: "rejected",
        reviewerName: "Diego",
        reviewedAt: item.reviewedAt,
        reason: "Imagen borrosa",
      }).success,
    ).toBe(true);

    const operation =
      createOpenApiDocument().paths?.[
        "/applications/{applicationId}/datasets/{datasetId}/evidence/{itemId}/review"
      ]?.patch;
    expect(operation?.responses?.["200"]).toBeDefined();
    expect(operation?.responses?.["404"]).toBeDefined();
  });

  it("keeps the reviewed classification label apart from the original prediction", () => {
    const item = {
      id: "item-1",
      evidenceId: "evidence-1",
      modelId: "model-1",
      modelVersion: "1.0.0",
      taskType: "classification",
      originalResult: { type: "classification", label: "pino", confidence: 0.9 },
      capturedAt: "2026-10-01T00:00:00.000Z",
      addedAt: "2026-10-02T00:00:00.000Z",
      imageUrl: "https://evidence.example/image",
      imageWidth: 640,
      imageHeight: 480,
      reviewStatus: "approved",
      reviewerName: "Diego",
      reviewedAt: "2026-10-03T00:00:00.000Z",
      reviewReason: null,
      reviewedLabel: "cedro",
      reviewedAnnotations: null,
    };
    expect(DatasetItemSchema.safeParse(item).success).toBe(true);
    expect(DatasetItemSchema.safeParse({ ...item, reviewedLabel: null }).success).toBe(true);
    expect(DatasetLabelRequestSchema.parse({ label: "  cedro " })).toEqual({ label: "cedro" });
    expect(DatasetLabelRequestSchema.safeParse({ label: "   " }).success).toBe(false);
    expect(DatasetLabelRequestSchema.safeParse({}).success).toBe(false);
    expect(DatasetLabelRequestSchema.safeParse({ label: "a".repeat(161) }).success).toBe(false);
    expect(DatasetLabelResponseSchema.safeParse({ reviewedLabel: "cedro" }).success).toBe(true);

    const operation =
      createOpenApiDocument().paths?.[
        "/applications/{applicationId}/datasets/{datasetId}/evidence/{itemId}/label"
      ]?.put;
    expect(operation?.responses?.["200"]).toBeDefined();
    expect(operation?.responses?.["400"]).toBeDefined();
    expect(operation?.responses?.["404"]).toBeDefined();
    expect(operation?.responses?.["409"]).toBeDefined();
  });

  it("keeps reviewed detection annotations, in image-relative coordinates, apart from the prediction", () => {
    const annotation = { label: "gato", box: { xMin: 0, yMin: 0.25, xMax: 1, yMax: 0.75 } };
    const item = {
      id: "item-1",
      evidenceId: "evidence-1",
      modelId: "model-1",
      modelVersion: "1.0.0",
      taskType: "detection",
      originalResult: {
        type: "detection",
        detections: [
          { label: "perro", confidence: 0.8, box: { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.6 } },
        ],
      },
      capturedAt: "2026-10-01T00:00:00.000Z",
      addedAt: "2026-10-02T00:00:00.000Z",
      imageUrl: "https://evidence.example/image",
      imageWidth: 640,
      imageHeight: 480,
      reviewStatus: "pending",
      reviewerName: null,
      reviewedAt: null,
      reviewReason: null,
      reviewedLabel: null,
      reviewedAnnotations: [annotation],
    };
    expect(DatasetItemSchema.safeParse(item).success).toBe(true);
    expect(DatasetItemSchema.safeParse({ ...item, reviewedAnnotations: null }).success).toBe(true);
    expect(DatasetItemSchema.safeParse({ ...item, reviewedAnnotations: undefined }).success).toBe(
      false,
    );
    expect(
      DatasetAnnotationsResponseSchema.safeParse({ reviewedAnnotations: [annotation] }).success,
    ).toBe(true);

    expect(
      parseDatasetAnnotationsRequest({
        annotations: [{ label: "  gato ", box: annotation.box }],
      }),
    ).toEqual({ success: true, data: { annotations: [annotation] } });
    // Removing every box records that the image shows no object.
    expect(parseDatasetAnnotationsRequest({ annotations: [] })).toEqual({
      success: true,
      data: { annotations: [] },
    });
  });

  it.each([
    [
      "a box past the right edge",
      [{ label: "gato", box: { xMin: 0.5, yMin: 0, xMax: 1.01, yMax: 1 } }],
      "boxOutOfBounds",
      "La caja debe permanecer dentro de la imagen.",
    ],
    [
      "a box above the top edge",
      [{ label: "gato", box: { xMin: 0, yMin: -0.1, xMax: 1, yMax: 1 } }],
      "boxOutOfBounds",
      "La caja debe permanecer dentro de la imagen.",
    ],
    [
      "a box out of bounds next to a blank label",
      [
        { label: " ", box: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 } },
        { label: "gato", box: { xMin: 0, yMin: 0, xMax: 2, yMax: 1 } },
      ],
      "boxOutOfBounds",
      "La caja debe permanecer dentro de la imagen.",
    ],
    [
      "a box without width",
      [{ label: "gato", box: { xMin: 0.5, yMin: 0, xMax: 0.5, yMax: 1 } }],
      "emptyBox",
      "La caja debe tener ancho y alto.",
    ],
    [
      "an inverted box",
      [{ label: "gato", box: { xMin: 0, yMin: 0.8, xMax: 1, yMax: 0.2 } }],
      "emptyBox",
      "La caja debe tener ancho y alto.",
    ],
    [
      "a blank label",
      [{ label: "  ", box: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 } }],
      "labelRequired",
      "Ingresa una etiqueta para cada caja.",
    ],
    [
      "a missing label",
      [{ box: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 } }],
      "labelRequired",
      "Ingresa una etiqueta para cada caja.",
    ],
    [
      "a label longer than 160 characters",
      [{ label: "a".repeat(161), box: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 } }],
      "invalidAnnotations",
      "Las anotaciones revisadas no son válidas.",
    ],
    [
      "a box missing a coordinate",
      [{ label: "gato", box: { xMin: 0, yMin: 0, xMax: 1 } }],
      "invalidAnnotations",
      "Las anotaciones revisadas no son válidas.",
    ],
    [
      "more than 100 boxes",
      Array.from({ length: 101 }, () => ({
        label: "gato",
        box: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 },
      })),
      "invalidAnnotations",
      "Las anotaciones revisadas no son válidas.",
    ],
  ])("rejects %s with a specific error", (_case, annotations, code, message) => {
    expect(parseDatasetAnnotationsRequest({ annotations })).toEqual({
      success: false,
      error: { code, message },
    });
  });

  it("rejects bodies without an annotation list and documents the annotations route", () => {
    const invalid = {
      code: "invalidAnnotations",
      message: "Las anotaciones revisadas no son válidas.",
    };
    expect(parseDatasetAnnotationsRequest(null)).toEqual({ success: false, error: invalid });
    expect(parseDatasetAnnotationsRequest({})).toEqual({ success: false, error: invalid });
    expect(parseDatasetAnnotationsRequest({ annotations: [], extra: true })).toEqual({
      success: false,
      error: invalid,
    });

    const operation =
      createOpenApiDocument().paths?.[
        "/applications/{applicationId}/datasets/{datasetId}/evidence/{itemId}/annotations"
      ]?.put;
    expect(operation?.responses?.["200"]).toBeDefined();
    expect(operation?.responses?.["400"]).toBeDefined();
    expect(operation?.responses?.["404"]).toBeDefined();
    expect(operation?.responses?.["409"]).toBeDefined();
  });
});

describe("dataset export check (US-084)", () => {
  const box = { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.6 };
  const item = (
    id: string,
    fields: {
      reviewStatus?: "pending" | "approved" | "rejected";
      reviewedLabel?: string | null;
      reviewedAnnotations?: unknown;
    } = {},
  ) => ({
    id,
    evidenceId: `evidence-${id}`,
    reviewStatus: "approved" as const,
    reviewedLabel: null,
    reviewedAnnotations: null,
    ...fields,
  });

  it("confirms a classification dataset whose approved items all have a reviewed label", () => {
    const check = checkDatasetForExport("classification", [
      item("item-1", { reviewedLabel: "pino" }),
      item("item-2", { reviewStatus: "pending" }),
      item("item-3", { reviewStatus: "rejected", reviewedLabel: "=cmd" }),
    ]);

    expect(check.problem).toBeNull();
    expect(check.invalidItems).toEqual([]);
    expect(check.approvedItems.map(({ id }) => id)).toEqual(["item-1"]);
  });

  it("identifies approved classification items without a usable reviewed label", () => {
    const check = checkDatasetForExport("classification", [
      item("item-1", { reviewedLabel: null }),
      item("item-2", { reviewedLabel: "   " }),
      item("item-3", { reviewedLabel: "=HYPERLINK()" }),
      item("item-4", { reviewedLabel: "pino" }),
      item("item-5", { reviewedLabel: "-1", reviewedAnnotations: [] }),
    ]);

    expect(check.problem).toBeNull();
    expect(
      check.invalidItems.map(({ item: invalid, cause }) => [
        invalid.id,
        invalid.evidenceId,
        cause.code,
        cause.message,
      ]),
    ).toEqual([
      [
        "item-1",
        "evidence-item-1",
        "reviewedLabelRequired",
        "La evidencia aprobada no tiene etiqueta revisada.",
      ],
      [
        "item-2",
        "evidence-item-2",
        "reviewedLabelRequired",
        "La evidencia aprobada no tiene etiqueta revisada.",
      ],
      [
        "item-3",
        "evidence-item-3",
        "formulaLabel",
        "La etiqueta revisada puede interpretarse como fórmula.",
      ],
      [
        "item-5",
        "evidence-item-5",
        "formulaLabel",
        "La etiqueta revisada puede interpretarse como fórmula.",
      ],
    ]);
  });

  it("confirms a detection dataset whose approved items have valid reviewed boxes or none", () => {
    const check = checkDatasetForExport("detection", [
      item("item-1", { reviewedAnnotations: [{ label: "gato", box }] }),
      item("item-2", { reviewedAnnotations: [] }),
      item("item-3", { reviewStatus: "pending" }),
    ]);

    expect(check.problem).toBeNull();
    expect(check.invalidItems).toEqual([]);
    expect(check.approvedItems.map(({ id }) => id)).toEqual(["item-1", "item-2"]);
  });

  it("identifies approved detection items without reviewed boxes or with invalid ones", () => {
    const check = checkDatasetForExport("detection", [
      item("item-1", { reviewedLabel: "gato" }),
      item("item-2", { reviewedAnnotations: [{ label: "gato", box: { ...box, xMax: 1.2 } }] }),
      item("item-3", { reviewedAnnotations: [{ label: "gato", box: { ...box, xMax: 0.1 } }] }),
      item("item-4", { reviewedAnnotations: [{ label: " ", box }] }),
      item("item-5", { reviewedAnnotations: "gato" }),
    ]);

    expect(check.invalidItems.map(({ item: invalid, cause }) => [invalid.id, cause])).toEqual([
      [
        "item-1",
        {
          code: "reviewedAnnotationsRequired",
          message: "La evidencia aprobada no tiene anotaciones revisadas.",
        },
      ],
      [
        "item-2",
        { code: "invalidAnnotations", message: "La caja debe permanecer dentro de la imagen." },
      ],
      ["item-3", { code: "invalidAnnotations", message: "La caja debe tener ancho y alto." }],
      ["item-4", { code: "invalidAnnotations", message: "Ingresa una etiqueta para cada caja." }],
      [
        "item-5",
        { code: "invalidAnnotations", message: "Las anotaciones revisadas no son válidas." },
      ],
    ]);
  });

  it.each(["classification", "detection"] as const)(
    "reports a %s dataset without approved items",
    (taskType) => {
      const check = checkDatasetForExport(taskType, [
        item("item-1", { reviewStatus: "pending" }),
        item("item-2", { reviewStatus: "rejected" }),
      ]);

      expect(check.problem).toEqual({
        code: "noApprovedItems",
        message: "El dataset no tiene evidencias aprobadas para exportar.",
      });
      expect(check.approvedItems).toEqual([]);
      expect(check.invalidItems).toEqual([]);
    },
  );

  it("checks YOLO image and class requirements alongside item validation", () => {
    const reviewed = { label: "gato", box: { ...box } };
    expect(
      checkDatasetForExport(
        "detection",
        [item("item-1", { reviewedAnnotations: [reviewed] })],
        "detection_yolo",
      ).problem?.code,
    ).toBe("requiresMultipleItems");
    expect(
      checkDatasetForExport(
        "detection",
        [item("item-1", { reviewedAnnotations: [] }), item("item-2", { reviewedAnnotations: [] })],
        "detection_yolo",
      ).problem?.code,
    ).toBe("noYoloClasses");
  });

  it("documents the read-only validation route and its response", () => {
    const operation =
      createOpenApiDocument().paths?.[
        "/applications/{applicationId}/datasets/{datasetId}/validation"
      ]?.get;
    expect(operation?.responses?.["200"]).toBeDefined();
    expect(operation?.responses?.["401"]).toBeDefined();
    expect(operation?.responses?.["400"]).toBeDefined();
    expect(operation?.responses?.["404"]).toBeDefined();
    expect(operation?.responses?.["500"]).toBeDefined();
    expect(operation?.parameters).toContainEqual(
      expect.objectContaining({ name: "format", in: "query", required: false }),
    );

    const invalidItem = {
      itemId: "item-1",
      evidenceId: "evidence-1",
      imageUrl: "https://evidence.example/image",
      imageWidth: 640,
      imageHeight: 480,
      cause: {
        code: "formulaLabel",
        message: "La etiqueta revisada puede interpretarse como fórmula.",
      },
    };
    const response = {
      ready: false,
      approvedCount: 1,
      problem: null,
      invalidItemCount: 1,
      invalidItems: [invalidItem],
    };
    expect(DatasetValidationResponseSchema.safeParse(response).success).toBe(true);
    expect(
      DatasetValidationResponseSchema.safeParse({
        ...response,
        problem: {
          code: "requiresMultipleItems",
          message: "Se necesitan al menos dos imágenes aprobadas para separar train y val.",
        },
      }).success,
    ).toBe(true);
    expect(
      DatasetValidationResponseSchema.safeParse({
        ...response,
        invalidItems: Array.from({ length: 101 }, () => invalidItem),
      }).success,
    ).toBe(false);
  });

  it("parses only the optional supported export format for validation", () => {
    expect(parseDatasetValidationQuery({})).toEqual({ success: true, data: {} });
    expect(parseDatasetValidationQuery({ format: "detection_yolo" })).toEqual({
      success: true,
      data: { format: "detection_yolo" },
    });
    expect(parseDatasetValidationQuery({ format: "invalid" })).toMatchObject({
      success: false,
      error: {
        code: "invalidDatasetValidationQuery",
        message: "El formato de validación no es válido.",
      },
    });
    expect(parseDatasetValidationQuery({ extra: "value" }).success).toBe(false);
  });
});
