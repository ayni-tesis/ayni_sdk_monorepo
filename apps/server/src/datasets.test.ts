import type {
  Dataset,
  DatasetAvailableEvidenceResponse,
  DatasetDetailResponse,
  DatasetEvidence,
  DatasetItem,
  DatasetListItem,
  DatasetListResponse,
  DatasetReviewResponse,
} from "@ayni/api/datasets";
import { describe, expect, it, vi } from "vitest";
import type {
  AddDatasetEvidenceInput,
  AddDatasetEvidenceResult,
  CreateDatasetInput,
  DatasetStoreResult,
  RemoveDatasetEvidenceInput,
  RemoveDatasetEvidenceResult,
  ReviewDatasetEvidenceInput,
  ReviewDatasetEvidenceResult,
  SaveDatasetItemAnnotationsInput,
  SaveDatasetItemAnnotationsResult,
  SaveDatasetItemLabelInput,
  SaveDatasetItemLabelResult,
} from "./dataset-store";
import { createDatasetsApp } from "./datasets";

const activeApplication = {
  id: "app-1",
  organizationId: "org-1",
  name: "Invernos",
  status: "active" as const,
};

const dataset: Dataset = {
  id: "dataset-1",
  applicationId: "app-1",
  name: "Flores",
  taskType: "classification",
  createdAt: "2026-10-01T00:00:00.000Z",
};

const datasetListItem: DatasetListItem = {
  ...dataset,
  evidenceCount: 0,
  approvedCount: 0,
};

const availableEvidence: DatasetEvidence = {
  evidenceId: "evidence-1",
  modelId: "model-1",
  modelVersion: "1.0.0",
  taskType: "classification",
  result: { type: "classification", labels: ["pino"] },
  capturedAt: "2026-10-01T00:00:00.000Z",
};

const datasetItem: DatasetItem = {
  id: "item-1",
  ...availableEvidence,
  originalResult: availableEvidence.result,
  addedAt: "2026-10-02T00:00:00.000Z",
  imageUrl: "https://evidence.example/image",
  imageWidth: 640,
  imageHeight: 480,
  reviewStatus: "pending",
  reviewerName: null,
  reviewedAt: null,
  reviewReason: null,
  reviewedLabel: null,
  reviewedAnnotations: null,
};

const reviewed: DatasetReviewResponse = {
  status: "rejected",
  reviewerName: "Diego",
  reviewedAt: "2026-10-03T00:00:00.000Z",
  reason: "Imagen borrosa",
};

const datasetDetail: DatasetDetailResponse = {
  dataset: datasetListItem,
  items: [datasetItem],
  nextItemOffset: null,
};

function makeApp({
  session = { user: { id: "admin" } },
  application = activeApplication,
  membershipRole = "admin",
  create = async (_input: CreateDatasetInput): Promise<DatasetStoreResult> => ({
    ok: true,
    value: dataset,
  }),
  get = async (
    _applicationId: string,
    _datasetId: string,
    _offset: number,
  ): Promise<DatasetDetailResponse | null> => datasetDetail,
  listAvailableEvidence = async (
    _applicationId: string,
    _datasetId: string,
    _offset: number,
  ): Promise<DatasetAvailableEvidenceResponse | null> => ({
    evidence: [availableEvidence],
    nextOffset: null,
  }),
  addEvidence = async (_input: AddDatasetEvidenceInput): Promise<AddDatasetEvidenceResult> => ({
    ok: true,
    value: [datasetItem],
  }),
  removeEvidence = async (
    _input: RemoveDatasetEvidenceInput,
  ): Promise<RemoveDatasetEvidenceResult> => ({ ok: true }),
  reviewEvidence = async (
    _input: ReviewDatasetEvidenceInput,
  ): Promise<ReviewDatasetEvidenceResult> => ({ ok: true, value: reviewed }),
  saveLabel = async (input: SaveDatasetItemLabelInput): Promise<SaveDatasetItemLabelResult> => ({
    ok: true,
    value: { reviewedLabel: input.label },
  }),
  saveAnnotations = async (
    input: SaveDatasetItemAnnotationsInput,
  ): Promise<SaveDatasetItemAnnotationsResult> => ({
    ok: true,
    value: { reviewedAnnotations: input.annotations },
  }),
  list = async (_applicationId: string): Promise<DatasetListResponse> => ({
    datasets: [datasetListItem],
  }),
}: {
  session?: { user: { id: string } } | null;
  application?:
    | typeof activeApplication
    | { id: string; organizationId: string; name: string; status: "active" | "archived" }
    | null;
  membershipRole?: string | null;
  create?: (input: CreateDatasetInput) => Promise<DatasetStoreResult>;
  get?: (
    applicationId: string,
    datasetId: string,
    offset: number,
  ) => Promise<DatasetDetailResponse | null>;
  listAvailableEvidence?: (
    applicationId: string,
    datasetId: string,
    offset: number,
  ) => Promise<DatasetAvailableEvidenceResponse | null>;
  addEvidence?: (input: AddDatasetEvidenceInput) => Promise<AddDatasetEvidenceResult>;
  removeEvidence?: (input: RemoveDatasetEvidenceInput) => Promise<RemoveDatasetEvidenceResult>;
  reviewEvidence?: (input: ReviewDatasetEvidenceInput) => Promise<ReviewDatasetEvidenceResult>;
  saveLabel?: (input: SaveDatasetItemLabelInput) => Promise<SaveDatasetItemLabelResult>;
  saveAnnotations?: (
    input: SaveDatasetItemAnnotationsInput,
  ) => Promise<SaveDatasetItemAnnotationsResult>;
  list?: (applicationId: string) => Promise<DatasetListResponse>;
} = {}) {
  const createMock = vi.fn(create);
  const getMock = vi.fn(get);
  const listAvailableEvidenceMock = vi.fn(listAvailableEvidence);
  const addEvidenceMock = vi.fn(addEvidence);
  const removeEvidenceMock = vi.fn(removeEvidence);
  const reviewEvidenceMock = vi.fn(reviewEvidence);
  const saveLabelMock = vi.fn(saveLabel);
  const saveAnnotationsMock = vi.fn(saveAnnotations);
  const listMock = vi.fn(list);
  const app = createDatasetsApp({
    getSession: async () => session,
    applications: {
      get: async () => application ?? undefined,
      getMembership: async () => membershipRole ?? undefined,
    },
    datasets: {
      addEvidence: addEvidenceMock,
      create: createMock,
      get: getMock,
      list: listMock,
      listAvailableEvidence: listAvailableEvidenceMock,
      removeEvidence: removeEvidenceMock,
      reviewEvidence: reviewEvidenceMock,
      saveLabel: saveLabelMock,
      saveAnnotations: saveAnnotationsMock,
    },
  });
  return {
    app,
    addEvidenceMock,
    createMock,
    getMock,
    listAvailableEvidenceMock,
    listMock,
    removeEvidenceMock,
    reviewEvidenceMock,
    saveAnnotationsMock,
    saveLabelMock,
  };
}

function jsonRequest(body: unknown, method = "POST") {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("application datasets", () => {
  it("returns a dataset detail only to members of its owning application", async () => {
    const { app, getMock } = makeApp({ membershipRole: "member" });
    const response = await app.request("/applications/app-1/datasets/dataset-1");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(datasetDetail);
    expect(getMock).toHaveBeenCalledWith("app-1", "dataset-1", 0);

    await app.request("/applications/app-1/datasets/dataset-1?offset=50");
    expect(getMock).toHaveBeenLastCalledWith("app-1", "dataset-1", 50);

    const foreign = makeApp({ application: null });
    const hiddenApplication = await foreign.app.request("/applications/app-1/datasets/dataset-1");
    expect(hiddenApplication.status).toBe(404);
    expect(await hiddenApplication.json()).toMatchObject({
      message: "No encontramos este dataset.",
    });
    expect(foreign.getMock).not.toHaveBeenCalled();

    const missing = makeApp({ get: async () => null });
    const hiddenDataset = await missing.app.request("/applications/app-1/datasets/foreign-id");
    expect(hiddenDataset.status).toBe(404);
    expect(await hiddenDataset.json()).toMatchObject({ message: "No encontramos este dataset." });

    const invalidOffset = makeApp();
    const invalidPage = await invalidOffset.app.request(
      "/applications/app-1/datasets/dataset-1?offset=invalid",
    );
    expect(invalidPage.status).toBe(400);
    expect(invalidOffset.getMock).not.toHaveBeenCalled();
  });

  it("lists only an administrator's compatible evidence for an active dataset", async () => {
    const { app, listAvailableEvidenceMock } = makeApp();
    const response = await app.request(
      "/applications/app-1/datasets/dataset-1/available-evidence?offset=50",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ evidence: [availableEvidence], nextOffset: null });
    expect(listAvailableEvidenceMock).toHaveBeenCalledWith("app-1", "dataset-1", 50);
    await app.request("/applications/app-1/datasets/dataset-1/available-evidence");
    expect(listAvailableEvidenceMock).toHaveBeenLastCalledWith("app-1", "dataset-1", 0);

    const member = makeApp({ membershipRole: "member" });
    const forbidden = await member.app.request(
      "/applications/app-1/datasets/dataset-1/available-evidence",
    );
    expect(forbidden.status).toBe(403);
    expect(member.listAvailableEvidenceMock).not.toHaveBeenCalled();

    const invalidOffset = makeApp();
    const invalidPage = await invalidOffset.app.request(
      "/applications/app-1/datasets/dataset-1/available-evidence?offset=-1",
    );
    expect(invalidPage.status).toBe(400);
    expect(invalidOffset.listAvailableEvidenceMock).not.toHaveBeenCalled();
  });

  it("adds selected evidence and reports a task-type mismatch", async () => {
    const { app, addEvidenceMock } = makeApp();
    const response = await app.request(
      "/applications/app-1/datasets/dataset-1/evidence",
      jsonRequest({ evidenceIds: ["evidence-1"] }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ items: [datasetItem] });
    expect(addEvidenceMock).toHaveBeenCalledWith({
      applicationId: "app-1",
      datasetId: "dataset-1",
      evidenceIds: ["evidence-1"],
      userId: "admin",
    });

    const tooMany = makeApp();
    const oversized = await tooMany.app.request(
      "/applications/app-1/datasets/dataset-1/evidence",
      jsonRequest({ evidenceIds: Array.from({ length: 501 }, (_, index) => `evidence-${index}`) }),
    );
    expect(oversized.status).toBe(400);
    expect(tooMany.addEvidenceMock).not.toHaveBeenCalled();

    const incompatible = makeApp({
      addEvidence: async () => ({ ok: false, reason: "incompatible" }),
    });
    const rejected = await incompatible.app.request(
      "/applications/app-1/datasets/dataset-1/evidence",
      jsonRequest({ evidenceIds: ["evidence-2"] }),
    );
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toMatchObject({
      message: "Esta evidencia no coincide con el tipo de tarea del dataset.",
    });
  });

  it("removes a dataset item for administrators and reports missing items", async () => {
    const { app, removeEvidenceMock } = makeApp();
    const response = await app.request("/applications/app-1/datasets/dataset-1/evidence/item-1", {
      method: "DELETE",
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(removeEvidenceMock).toHaveBeenCalledWith({
      applicationId: "app-1",
      datasetId: "dataset-1",
      itemId: "item-1",
      userId: "admin",
    });

    const member = makeApp({ membershipRole: "member" });
    const forbidden = await member.app.request(
      "/applications/app-1/datasets/dataset-1/evidence/item-1",
      { method: "DELETE" },
    );
    expect(forbidden.status).toBe(403);
    expect(member.removeEvidenceMock).not.toHaveBeenCalled();

    const missing = makeApp({
      removeEvidence: async () => ({ ok: false, reason: "notFound" }),
    });
    const notFound = await missing.app.request(
      "/applications/app-1/datasets/dataset-1/evidence/foreign-item",
      { method: "DELETE" },
    );
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toMatchObject({
      message: "No encontramos este ítem del dataset.",
    });

    const archived = makeApp({ application: { ...activeApplication, status: "archived" } });
    const unavailable = await archived.app.request(
      "/applications/app-1/datasets/dataset-1/evidence/item-1",
      { method: "DELETE" },
    );
    expect(unavailable.status).toBe(409);
    expect(archived.removeEvidenceMock).not.toHaveBeenCalled();
  });

  it("does not expose available evidence for foreign or archived applications", async () => {
    const foreign = makeApp({ application: null });
    const hidden = await foreign.app.request(
      "/applications/app-1/datasets/dataset-1/available-evidence",
    );
    expect(hidden.status).toBe(404);
    expect(foreign.listAvailableEvidenceMock).not.toHaveBeenCalled();

    const archived = makeApp({ application: { ...activeApplication, status: "archived" } });
    const unavailable = await archived.app.request(
      "/applications/app-1/datasets/dataset-1/available-evidence",
    );
    expect(unavailable.status).toBe(409);
    expect(archived.listAvailableEvidenceMock).not.toHaveBeenCalled();
  });

  it("reports dataset detail read failures", async () => {
    const { app } = makeApp({ get: async () => Promise.reject(new Error("offline")) });
    const response = await app.request("/applications/app-1/datasets/dataset-1");

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ message: "No pudimos cargar el dataset." });
  });

  it("lists datasets for any member, including archived applications", async () => {
    const { app, listMock } = makeApp({
      application: { ...activeApplication, status: "archived" },
      membershipRole: "member",
    });
    const response = await app.request("/applications/app-1/datasets");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ datasets: [datasetListItem] });
    expect(listMock).toHaveBeenCalledWith("app-1");
  });

  it("hides foreign application datasets and reports listing failures", async () => {
    const foreign = makeApp({ application: null });
    const hidden = await foreign.app.request("/applications/app-1/datasets");
    expect(hidden.status).toBe(404);
    expect(foreign.listMock).not.toHaveBeenCalled();

    const failed = makeApp({ list: async () => Promise.reject(new Error("offline")) });
    const unavailable = await failed.app.request("/applications/app-1/datasets");
    expect(unavailable.status).toBe(500);
    expect(await unavailable.json()).toMatchObject({ message: "No pudimos cargar los datasets." });
  });

  it("creates an empty application dataset for an administrator", async () => {
    const { app, createMock } = makeApp();
    const response = await app.request(
      "/applications/app-1/datasets",
      jsonRequest({ name: " Flores ", taskType: "classification" }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ dataset });
    expect(createMock).toHaveBeenCalledWith({
      applicationId: "app-1",
      userId: "admin",
      name: "Flores",
      taskType: "classification",
    });
  });

  it.each([
    [{ name: "  ", taskType: "detection" }, "Ingresa un nombre para el dataset."],
    [{ name: "Flores" }, "Selecciona el tipo de tarea."],
    [
      { name: "Flores", taskType: "classification", unexpected: true },
      "Los datos del dataset no son válidos.",
    ],
  ])("rejects invalid input before writing", async (body, message) => {
    const { app, createMock } = makeApp();
    const response = await app.request("/applications/app-1/datasets", jsonRequest(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("hides foreign applications and blocks workspace members from creation", async () => {
    const foreign = makeApp({ application: null });
    const hidden = await foreign.app.request(
      "/applications/app-1/datasets",
      jsonRequest({ name: "Flores", taskType: "classification" }),
    );
    expect(hidden.status).toBe(404);
    expect(foreign.createMock).not.toHaveBeenCalled();

    const member = makeApp({ membershipRole: "member" });
    const forbidden = await member.app.request(
      "/applications/app-1/datasets",
      jsonRequest({ name: "Flores", taskType: "classification" }),
    );
    expect(forbidden.status).toBe(403);
    expect(member.createMock).not.toHaveBeenCalled();
  });

  it("blocks creation in archived applications", async () => {
    const archived = makeApp({ application: { ...activeApplication, status: "archived" } });
    const response = await archived.app.request(
      "/applications/app-1/datasets",
      jsonRequest({ name: "Flores", taskType: "classification" }),
    );

    expect(response.status).toBe(409);
    expect(archived.createMock).not.toHaveBeenCalled();
  });

  it("lets any workspace member approve or reject evidence and records the review", async () => {
    const { app, reviewEvidenceMock } = makeApp({ membershipRole: "member" });
    const response = await app.request(
      "/applications/app-1/datasets/dataset-1/evidence/item-1/review",
      jsonRequest({ status: "rejected", reason: "Imagen borrosa" }, "PATCH"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(reviewed);
    expect(reviewEvidenceMock).toHaveBeenCalledWith({
      applicationId: "app-1",
      datasetId: "dataset-1",
      itemId: "item-1",
      userId: "admin",
      status: "rejected",
      reason: "Imagen borrosa",
    });
  });

  it("hides foreign evidence and rejects invalid review decisions", async () => {
    const foreign = makeApp({ application: null });
    const hidden = await foreign.app.request(
      "/applications/app-1/datasets/dataset-1/evidence/item-1/review",
      jsonRequest({ status: "approved" }, "PATCH"),
    );
    expect(hidden.status).toBe(404);
    expect(foreign.reviewEvidenceMock).not.toHaveBeenCalled();

    const invalid = makeApp();
    const rejected = await invalid.app.request(
      "/applications/app-1/datasets/dataset-1/evidence/item-1/review",
      jsonRequest({ status: "pending" }, "PATCH"),
    );
    expect(rejected.status).toBe(400);
    expect(invalid.reviewEvidenceMock).not.toHaveBeenCalled();
  });

  it("lets any workspace member save a reviewed classification label", async () => {
    const { app, saveLabelMock } = makeApp({
      application: { ...activeApplication, status: "archived" },
      membershipRole: "member",
    });
    const response = await app.request(
      "/applications/app-1/datasets/dataset-1/evidence/item-1/label",
      jsonRequest({ label: "  cedro " }, "PUT"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reviewedLabel: "cedro" });
    expect(saveLabelMock).toHaveBeenCalledWith({
      applicationId: "app-1",
      datasetId: "dataset-1",
      itemId: "item-1",
      userId: "admin",
      label: "cedro",
    });
  });

  it.each([
    [{ label: "   " }, "Ingresa una etiqueta para una evidencia aprobada.", "labelRequired"],
    [{}, "Ingresa una etiqueta para una evidencia aprobada.", "labelRequired"],
    [{ label: "a".repeat(161) }, "La etiqueta revisada no es válida.", "invalidLabel"],
    [{ label: "cedro", extra: true }, "La etiqueta revisada no es válida.", "invalidLabel"],
  ])("rejects an empty or invalid label before writing", async (body, message, code) => {
    const { app, saveLabelMock } = makeApp();
    const response = await app.request(
      "/applications/app-1/datasets/dataset-1/evidence/item-1/label",
      jsonRequest(body, "PUT"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message, code });
    expect(saveLabelMock).not.toHaveBeenCalled();
  });

  it("hides foreign evidence and reports detection items and save failures", async () => {
    const foreign = makeApp({ application: null });
    const hidden = await foreign.app.request(
      "/applications/app-1/datasets/dataset-1/evidence/item-1/label",
      jsonRequest({ label: "cedro" }, "PUT"),
    );
    expect(hidden.status).toBe(404);
    expect(foreign.saveLabelMock).not.toHaveBeenCalled();

    const missing = makeApp({ saveLabel: async () => ({ ok: false, reason: "notFound" }) });
    const notFound = await missing.app.request(
      "/applications/app-1/datasets/dataset-1/evidence/foreign-item/label",
      jsonRequest({ label: "cedro" }, "PUT"),
    );
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toMatchObject({
      message: "No encontramos esta evidencia del dataset.",
    });

    const detection = makeApp({
      saveLabel: async () => ({ ok: false, reason: "notClassification" }),
    });
    const conflict = await detection.app.request(
      "/applications/app-1/datasets/dataset-1/evidence/item-1/label",
      jsonRequest({ label: "cedro" }, "PUT"),
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({
      message: "Esta evidencia no es de clasificación.",
      code: "datasetEvidenceNotClassification",
    });

    const failed = makeApp({ saveLabel: async () => ({ ok: false, reason: "databaseFailed" }) });
    const unavailable = await failed.app.request(
      "/applications/app-1/datasets/dataset-1/evidence/item-1/label",
      jsonRequest({ label: "cedro" }, "PUT"),
    );
    expect(unavailable.status).toBe(500);
    expect(await unavailable.json()).toEqual({
      message: "No pudimos guardar la etiqueta revisada.",
      code: "datasetLabelSaveFailed",
    });
  });

  const annotationsPath = "/applications/app-1/datasets/dataset-1/evidence/item-1/annotations";
  const box = { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.6 };

  it("lets any workspace member save reviewed detection annotations", async () => {
    const { app, saveAnnotationsMock } = makeApp({
      application: { ...activeApplication, status: "archived" },
      membershipRole: "member",
    });
    const response = await app.request(
      annotationsPath,
      jsonRequest({ annotations: [{ label: " gato ", box }] }, "PUT"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reviewedAnnotations: [{ label: "gato", box }] });
    expect(saveAnnotationsMock).toHaveBeenCalledWith({
      applicationId: "app-1",
      datasetId: "dataset-1",
      itemId: "item-1",
      userId: "admin",
      annotations: [{ label: "gato", box }],
    });
  });

  it.each([
    [
      { annotations: [{ label: "gato", box: { ...box, xMax: 1.2 } }] },
      "La caja debe permanecer dentro de la imagen.",
      "boxOutOfBounds",
    ],
    [
      { annotations: [{ label: "gato", box: { ...box, yMax: 0.2 } }] },
      "La caja debe tener ancho y alto.",
      "emptyBox",
    ],
    [
      { annotations: [{ label: "  ", box }] },
      "Ingresa una etiqueta para cada caja.",
      "labelRequired",
    ],
    [{ boxes: [] }, "Las anotaciones revisadas no son válidas.", "invalidAnnotations"],
  ])(
    "rejects invalid annotations before writing, keeping the previous ones",
    async (body, message, code) => {
      const { app, saveAnnotationsMock } = makeApp();
      const response = await app.request(annotationsPath, jsonRequest(body, "PUT"));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ message, code });
      expect(saveAnnotationsMock).not.toHaveBeenCalled();
    },
  );

  it("hides foreign evidence and reports classification items and save failures", async () => {
    const body = { annotations: [{ label: "gato", box }] };
    const foreign = makeApp({ application: null });
    const hidden = await foreign.app.request(annotationsPath, jsonRequest(body, "PUT"));
    expect(hidden.status).toBe(404);
    expect(foreign.saveAnnotationsMock).not.toHaveBeenCalled();

    const missing = makeApp({ saveAnnotations: async () => ({ ok: false, reason: "notFound" }) });
    const notFound = await missing.app.request(annotationsPath, jsonRequest(body, "PUT"));
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({
      message: "No encontramos esta evidencia del dataset.",
      code: "notFound",
    });

    const classification = makeApp({
      saveAnnotations: async () => ({ ok: false, reason: "notDetection" }),
    });
    const conflict = await classification.app.request(annotationsPath, jsonRequest(body, "PUT"));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({
      message: "Esta evidencia no es de detección.",
      code: "datasetEvidenceNotDetection",
    });

    const failed = makeApp({
      saveAnnotations: async () => ({ ok: false, reason: "databaseFailed" }),
    });
    const unavailable = await failed.app.request(annotationsPath, jsonRequest(body, "PUT"));
    expect(unavailable.status).toBe(500);
    expect(await unavailable.json()).toEqual({
      message: "No pudimos guardar las anotaciones revisadas.",
      code: "datasetAnnotationsSaveFailed",
    });
  });
});
