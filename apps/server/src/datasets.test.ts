import type {
  Dataset,
  DatasetAvailableEvidenceResponse,
  DatasetDetailResponse,
  DatasetEvidence,
  DatasetItem,
  DatasetListItem,
  DatasetListResponse,
} from "@ayni/api/datasets";
import { describe, expect, it, vi } from "vitest";
import type {
  AddDatasetEvidenceInput,
  AddDatasetEvidenceResult,
  CreateDatasetInput,
  DatasetStoreResult,
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
};

const datasetDetail: DatasetDetailResponse = { dataset: datasetListItem, items: [datasetItem] };

function makeApp({
  session = { user: { id: "admin" } },
  application = activeApplication,
  membershipRole = "admin",
  create = async (_input: CreateDatasetInput): Promise<DatasetStoreResult> => ({
    ok: true,
    value: dataset,
  }),
  get = async (_applicationId: string, _datasetId: string): Promise<DatasetDetailResponse | null> =>
    datasetDetail,
  listAvailableEvidence = async (
    _applicationId: string,
    _datasetId: string,
  ): Promise<DatasetAvailableEvidenceResponse | null> => ({ evidence: [availableEvidence] }),
  addEvidence = async (_input: AddDatasetEvidenceInput): Promise<AddDatasetEvidenceResult> => ({
    ok: true,
    value: [datasetItem],
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
  get?: (applicationId: string, datasetId: string) => Promise<DatasetDetailResponse | null>;
  listAvailableEvidence?: (
    applicationId: string,
    datasetId: string,
  ) => Promise<DatasetAvailableEvidenceResponse | null>;
  addEvidence?: (input: AddDatasetEvidenceInput) => Promise<AddDatasetEvidenceResult>;
  list?: (applicationId: string) => Promise<DatasetListResponse>;
} = {}) {
  const createMock = vi.fn(create);
  const getMock = vi.fn(get);
  const listAvailableEvidenceMock = vi.fn(listAvailableEvidence);
  const addEvidenceMock = vi.fn(addEvidence);
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
    },
  });
  return { app, addEvidenceMock, createMock, getMock, listAvailableEvidenceMock, listMock };
}

function jsonRequest(body: unknown) {
  return {
    method: "POST",
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
    expect(getMock).toHaveBeenCalledWith("app-1", "dataset-1");

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
  });

  it("lists only an administrator's compatible evidence for an active dataset", async () => {
    const { app, listAvailableEvidenceMock } = makeApp();
    const response = await app.request("/applications/app-1/datasets/dataset-1/available-evidence");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ evidence: [availableEvidence] });
    expect(listAvailableEvidenceMock).toHaveBeenCalledWith("app-1", "dataset-1");

    const member = makeApp({ membershipRole: "member" });
    const forbidden = await member.app.request(
      "/applications/app-1/datasets/dataset-1/available-evidence",
    );
    expect(forbidden.status).toBe(403);
    expect(member.listAvailableEvidenceMock).not.toHaveBeenCalled();
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
});
