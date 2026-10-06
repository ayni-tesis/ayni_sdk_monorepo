import type { Dataset, DatasetListItem, DatasetListResponse } from "@ayni/api/datasets";
import { describe, expect, it, vi } from "vitest";
import type { CreateDatasetInput, DatasetStoreResult } from "./dataset-store";
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

function makeApp({
  session = { user: { id: "admin" } },
  application = activeApplication,
  membershipRole = "admin",
  create = async (_input: CreateDatasetInput): Promise<DatasetStoreResult> => ({
    ok: true,
    value: dataset,
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
  list?: (applicationId: string) => Promise<DatasetListResponse>;
} = {}) {
  const createMock = vi.fn(create);
  const listMock = vi.fn(list);
  const app = createDatasetsApp({
    getSession: async () => session,
    applications: {
      get: async () => application ?? undefined,
      getMembership: async () => membershipRole ?? undefined,
    },
    datasets: { create: createMock, list: listMock },
  });
  return { app, createMock, listMock };
}

function jsonRequest(body: unknown) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("application datasets", () => {
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
