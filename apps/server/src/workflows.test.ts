import { application, member, workflow, workflowVersion } from "@ayni/db/schema/index";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import type { Application } from "./applications";
import {
  type AddImageInputResult,
  type ArchiveWorkflowResult,
  addConditionNode,
  addImageInputNode,
  addModelNode,
  addOutputNode,
  addWorkflowConnection,
  archiveWorkflow,
  type ChangeWorkflowConnectionInput,
  type ChangeWorkflowConnectionResult,
  type CreateWorkflowResult,
  createWorkflow,
  type DeleteWorkflowNodeResult,
  deleteWorkflowNode,
  getWorkflow,
  listWorkflows,
  type RenameWorkflowResult,
  removeWorkflowConnection,
  renameWorkflow,
  type TransactionExecutor,
  type UpdateWorkflowNodeInput,
  type UpdateWorkflowNodeResult,
  updateWorkflowNode,
  updateWorkflowNodePositions,
  type Workflow,
  type WorkflowDatabase,
  type WorkflowDetail,
} from "./workflow-store";
import type { WorkflowValidationResult } from "./workflow-validation";
import type {
  PublishWorkflowVersionInput,
  PublishWorkflowVersionResult,
} from "./workflow-version-store";
import { createWorkflowsApp } from "./workflows";

const activeApplication: Application = {
  id: "app-1",
  organizationId: "org-1",
  name: "Cámara",
  status: "active",
};

const sampleWorkflow: Workflow = {
  id: "workflow-1",
  applicationId: "app-1",
  name: "Diagnóstico de hoja de café",
  status: "draft",
  createdAt: "2026-09-21T15:00:00.000Z",
  updatedAt: "2026-09-21T16:00:00.000Z",
};

const sampleDetail: WorkflowDetail = {
  workflow: sampleWorkflow,
  draft: { nodes: [] },
  draftRevision: 0,
  versions: [],
};

// The draft revision the request helpers send, and the one a saved change leaves (US-130).
const BASE_REVISION = 4;
const NEXT_REVISION = 5;

/** Adds the draft revision a canvas change is based on, unless the body names one. */
function withDraftRevision(body: unknown) {
  return body && typeof body === "object" && !Array.isArray(body)
    ? { draftRevision: BASE_REVISION, ...body }
    : body;
}

type CreateInput = { applicationId: string; userId: string; name: string };
type RenameInput = { applicationId: string; workflowId: string; userId: string; name: string };
type ArchiveInput = { applicationId: string; workflowId: string; userId: string };
type AddImageInputInput = import("./workflow-store").AddImageInputInput;

function makeApp({
  session = { user: { id: "admin" } },
  application = activeApplication,
  membershipRole = "admin",
  listedWorkflows,
  workflowDetail = sampleDetail,
  create = async ({ applicationId, name }: CreateInput): Promise<CreateWorkflowResult> => ({
    ok: true,
    workflow: {
      id: "workflow-1",
      applicationId,
      name,
      status: "draft",
      createdAt: "2026-09-21T15:00:00.000Z",
      updatedAt: "2026-09-21T15:00:00.000Z",
    },
  }),
  rename = async ({
    applicationId,
    workflowId,
    name,
  }: RenameInput): Promise<RenameWorkflowResult> => ({
    ok: true,
    workflow: {
      id: workflowId,
      applicationId,
      name,
      status: "draft",
      createdAt: "2026-09-21T15:00:00.000Z",
      updatedAt: "2026-09-22T09:00:00.000Z",
    },
  }),
  archive = async ({ workflowId }: ArchiveInput): Promise<ArchiveWorkflowResult> => ({
    ok: true,
    workflow: {
      ...sampleWorkflow,
      id: workflowId,
      status: "archived",
      updatedAt: "2026-09-24T12:00:00.000Z",
    },
  }),
  addImageInput = async (): Promise<AddImageInputResult> => ({
    ok: true,
    draft: { nodes: [{ id: "node-1", type: "input.image", outputs: { imagen: "image" } }] },
    draftRevision: NEXT_REVISION,
  }),
  addConditionNode = async () => ({ ok: false as const, reason: "incompatibleSource" as const }),
  addModelNode = async () => ({ ok: false as const, reason: "modelVersionNotFound" as const }),
  addOutputNode = async () => ({ ok: false as const, reason: "incompatibleSource" as const }),
  updateNodePositions = async ({
    positions,
  }: import("./workflow-store").UpdateWorkflowNodePositionsInput) => ({
    ok: true as const,
    positions,
    draftRevision: NEXT_REVISION,
  }),
  deleteNode = async (): Promise<DeleteWorkflowNodeResult> => ({
    ok: true,
    draft: { nodes: [] },
    draftRevision: NEXT_REVISION,
  }),
  updateNode = async (): Promise<UpdateWorkflowNodeResult> => ({
    ok: true,
    draft: { nodes: [] },
    draftRevision: NEXT_REVISION,
  }),
  publishVersion = async ({
    workflowId,
    version,
  }: PublishWorkflowVersionInput): Promise<PublishWorkflowVersionResult> => ({
    ok: true,
    version: { id: "version-1", workflowId, version, createdAt: "2026-09-24T12:00:00.000Z" },
  }),
  addConnection = async (): Promise<ChangeWorkflowConnectionResult> => ({
    ok: false,
    reason: "incompatible",
  }),
  removeConnection = async (): Promise<ChangeWorkflowConnectionResult> => ({
    ok: false,
    reason: "connectionNotFound",
  }),
}: {
  session?: { user: { id: string } } | null;
  application?: Application | null;
  membershipRole?: string | null;
  listedWorkflows?: Workflow[];
  workflowDetail?: WorkflowDetail | null;
  create?: (input: CreateInput) => Promise<CreateWorkflowResult>;
  rename?: (input: RenameInput) => Promise<RenameWorkflowResult>;
  archive?: (input: ArchiveInput) => Promise<ArchiveWorkflowResult>;
  addImageInput?: (input: AddImageInputInput) => Promise<AddImageInputResult>;
  addModelNode?: (input: {
    applicationId: string;
    workflowId: string;
    userId: string;
    modelVersionId: string;
    position?: { x: number; y: number };
    source?: { nodeId: string; port: string };
  }) => Promise<import("./workflow-store").AddModelNodeResult>;
  addConditionNode?: (
    input: import("./workflow-store").AddConditionNodeInput,
  ) => Promise<import("./workflow-store").AddConditionNodeResult>;
  addOutputNode?: (
    input: import("./workflow-store").AddOutputNodeInput,
  ) => Promise<import("./workflow-store").AddOutputNodeResult>;
  updateNodePositions?: (
    input: import("./workflow-store").UpdateWorkflowNodePositionsInput,
  ) => Promise<import("./workflow-store").UpdateWorkflowNodePositionsResult>;
  deleteNode?: (
    input: import("./workflow-store").DeleteWorkflowNodeInput,
  ) => Promise<DeleteWorkflowNodeResult>;
  updateNode?: (input: UpdateWorkflowNodeInput) => Promise<UpdateWorkflowNodeResult>;
  publishVersion?: (input: PublishWorkflowVersionInput) => Promise<PublishWorkflowVersionResult>;
  addConnection?: (input: ChangeWorkflowConnectionInput) => Promise<ChangeWorkflowConnectionResult>;
  removeConnection?: (
    input: ChangeWorkflowConnectionInput,
  ) => Promise<ChangeWorkflowConnectionResult>;
} = {}) {
  const createMock = vi.fn(create);
  const listMock = vi.fn(async (_applicationId: string) => listedWorkflows ?? [sampleWorkflow]);
  const getMock = vi.fn(
    async (_applicationId: string, _workflowId: string) => workflowDetail ?? undefined,
  );
  const renameMock = vi.fn(rename);
  const archiveMock = vi.fn(archive);
  const addImageInputMock = vi.fn(addImageInput);
  const addModelNodeMock = vi.fn(addModelNode);
  const addConditionNodeMock = vi.fn(addConditionNode);
  const addOutputNodeMock = vi.fn(addOutputNode);
  const addConnectionMock = vi.fn(addConnection);
  const removeConnectionMock = vi.fn(removeConnection);
  const updateNodePositionsMock = vi.fn(updateNodePositions);
  const deleteNodeMock = vi.fn(deleteNode);
  const updateNodeMock = vi.fn(updateNode);
  const publishVersionMock = vi.fn(publishVersion);
  return {
    create: createMock,
    list: listMock,
    get: getMock,
    rename: renameMock,
    archive: archiveMock,
    addImageInput: addImageInputMock,
    addModelNode: addModelNodeMock,
    addConditionNode: addConditionNodeMock,
    addOutputNode: addOutputNodeMock,
    addConnection: addConnectionMock,
    removeConnection: removeConnectionMock,
    updateNodePositions: updateNodePositionsMock,
    deleteNode: deleteNodeMock,
    updateNode: updateNodeMock,
    publishVersion: publishVersionMock,
    request: createWorkflowsApp({
      getSession: async () => session,
      applications: {
        get: async () => application ?? undefined,
        getMembership: async () => membershipRole ?? undefined,
      },
      workflows: {
        create: createMock,
        list: listMock,
        get: getMock,
        rename: renameMock,
        archive: archiveMock,
        addImageInput: addImageInputMock,
        addModelNode: addModelNodeMock,
        addConditionNode: addConditionNodeMock,
        addOutputNode: addOutputNodeMock,
        addConnection: addConnectionMock,
        removeConnection: removeConnectionMock,
        updateNodePositions: updateNodePositionsMock,
        deleteNode: deleteNodeMock,
        updateNode: updateNodeMock,
        publishVersion: publishVersionMock,
      },
    }),
  };
}

function postWorkflow(request: ReturnType<typeof makeApp>["request"], body: unknown) {
  return request.request("/applications/app-1/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchWorkflow(
  request: ReturnType<typeof makeApp>["request"],
  body: unknown,
  workflowId = "workflow-1",
) {
  return request.request(`/applications/app-1/workflows/${workflowId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchWorkflowLayout(request: ReturnType<typeof makeApp>["request"], body: unknown) {
  return request.request("/applications/app-1/workflows/workflow-1/layout", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withDraftRevision(body)),
  });
}

describe("PATCH /applications/:applicationId/workflows/:workflowId/layout", () => {
  it("saves the positions of every moved node in one operation", async () => {
    const app = makeApp();
    const positions = { "node-1": { x: 264, y: 512 }, "node-2": { x: -48, y: -16 } };
    const response = await patchWorkflowLayout(app.request, { positions });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ positions, draftRevision: NEXT_REVISION });
    expect(app.updateNodePositions).toHaveBeenCalledTimes(1);
    expect(app.updateNodePositions).toHaveBeenCalledWith({
      applicationId: "app-1",
      workflowId: "workflow-1",
      userId: "admin",
      positions,
      draftRevision: BASE_REVISION,
    });
  });

  it.each([
    { positions: {} },
    { positions: { "node-1": { x: -100_001, y: 0 } } },
    { positions: { "node-1": { x: 0, y: 100_001 } } },
    { positions: { "node-1": { x: 0, y: 0 }, "node-2": { x: "1", y: 2 } } },
    { x: 10, y: 20 },
  ])("rejects an invalid layout without saving any position", async (body) => {
    const app = makeApp();
    const response = await patchWorkflowLayout(app.request, body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "No pudimos guardar las posiciones.",
    });
    expect(app.updateNodePositions).not.toHaveBeenCalled();
  });

  it("keeps node positions administrator-only", async () => {
    const app = makeApp({
      membershipRole: "member",
      updateNodePositions: async () => ({ ok: false, reason: "forbidden" }),
    });
    const response = await patchWorkflowLayout(app.request, {
      positions: { "node-1": { x: 10, y: 20 } },
    });

    expect(response.status).toBe(403);
    expect(app.updateNodePositions).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["archived", 409],
    ["nodeNotFound", 404],
    ["workflowNotFound", 404],
  ] as const)("maps %s to %i", async (reason, status) => {
    const app = makeApp({ updateNodePositions: async () => ({ ok: false, reason }) });
    const response = await patchWorkflowLayout(app.request, {
      positions: { "node-1": { x: 10, y: 20 } },
    });

    expect(response.status).toBe(status);
  });
});

describe("DELETE /applications/:applicationId/workflows/:workflowId/nodes/:nodeId", () => {
  it("deletes a draft node and returns the updated draft", async () => {
    const draft = { nodes: [] };
    const deleteNode = vi.fn(async () => ({
      ok: true as const,
      draft,
      draftRevision: NEXT_REVISION,
    }));
    const { request } = makeApp({ deleteNode });
    const response = await request.request(
      "/applications/app-1/workflows/workflow-1/nodes/node-1",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftRevision: BASE_REVISION }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ draft, draftRevision: NEXT_REVISION });
    expect(deleteNode).toHaveBeenCalledWith({
      applicationId: "app-1",
      workflowId: "workflow-1",
      draftRevision: BASE_REVISION,
      nodeId: "node-1",
      userId: "admin",
    });
  });

  it("keeps node deletion administrator-only", async () => {
    const { request, deleteNode } = makeApp({
      membershipRole: "member",
      deleteNode: async () => ({ ok: false as const, reason: "forbidden" as const }),
    });
    const response = await request.request(
      "/applications/app-1/workflows/workflow-1/nodes/node-1",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftRevision: BASE_REVISION }),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para editar este workflow.",
    });
    expect(deleteNode).toHaveBeenCalledTimes(1);
  });
});

function patchWorkflowNode(
  request: ReturnType<typeof makeApp>["request"],
  body: unknown,
  nodeId = "condition-1",
) {
  return request.request(`/applications/app-1/workflows/workflow-1/nodes/${nodeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withDraftRevision(body)),
  });
}

describe("PATCH /applications/:applicationId/workflows/:workflowId/nodes/:nodeId", () => {
  const conditionChanges = { type: "condition", label: " roya ", operator: "lt", threshold: 0.3 };

  it("saves a condition's configuration and returns the updated draft", async () => {
    const draft = { nodes: [] };
    const updateNode = vi.fn(async () => ({
      ok: true as const,
      draft,
      draftRevision: NEXT_REVISION,
    }));
    const { request } = makeApp({ updateNode });
    const response = await patchWorkflowNode(request, conditionChanges);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ draft, draftRevision: NEXT_REVISION });
    expect(updateNode).toHaveBeenCalledWith({
      applicationId: "app-1",
      workflowId: "workflow-1",
      draftRevision: BASE_REVISION,
      nodeId: "condition-1",
      userId: "admin",
      changes: { type: "condition", label: "roya", operator: "lt", threshold: 0.3 },
    });
  });

  it("saves an output's trimmed name", async () => {
    const { request, updateNode } = makeApp();
    const response = await patchWorkflowNode(
      request,
      { type: "output", name: " Hoja sana " },
      "output-1",
    );

    expect(response.status).toBe(200);
    expect(updateNode).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: "output-1",
        changes: { type: "output", name: "Hoja sana" },
      }),
    );
  });

  it.each([
    [{ ...conditionChanges, operator: "eval" }, "Ingresa una condición válida."],
    [{ ...conditionChanges, threshold: 1.2 }, "Ingresa una condición válida."],
    [{ ...conditionChanges, label: " " }, "Ingresa una condición válida."],
    [{ type: "output", name: "  " }, "Ingresa un nombre para la salida."],
    [{ type: "model.tflite", modelVersionId: "version-2" }, "Este nodo no se puede editar."],
    [null, "Este nodo no se puede editar."],
  ])("rejects %j with 400 without saving", async (body, message) => {
    const { request, updateNode } = makeApp();
    const response = await patchWorkflowNode(request, body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message });
    expect(updateNode).not.toHaveBeenCalled();
  });

  it("rejects a label the source model does not produce with the condition message", async () => {
    const { request } = makeApp({
      updateNode: async () => ({ ok: false, reason: "incompatibleSource" }),
    });
    const response = await patchWorkflowNode(request, conditionChanges);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "Esta condición no es compatible con la salida seleccionada.",
    });
  });

  it("keeps editing a node administrator-only", async () => {
    const { request, updateNode } = makeApp({
      membershipRole: "member",
      updateNode: async () => ({ ok: false, reason: "forbidden" }),
    });
    const response = await patchWorkflowNode(request, conditionChanges);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para editar este workflow.",
    });
    expect(updateNode).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["archived", 409],
    ["notEditable", 409],
    ["nodeNotFound", 404],
    ["workflowNotFound", 404],
    ["notFound", 404],
  ] as const)("maps %s to %i", async (reason, status) => {
    const { request } = makeApp({ updateNode: async () => ({ ok: false, reason }) });
    const response = await patchWorkflowNode(request, conditionChanges);

    expect(response.status).toBe(status);
  });

  it("answers a non-member exactly like a missing application, without saving", async () => {
    const { request, updateNode } = makeApp({ membershipRole: null });
    const response = await patchWorkflowNode(request, conditionChanges);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ message: "No encontramos esta aplicación." });
    expect(updateNode).not.toHaveBeenCalled();
  });
});

function postWorkflowNode(request: ReturnType<typeof makeApp>["request"], body: unknown) {
  return request.request("/applications/app-1/workflows/workflow-1/nodes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withDraftRevision(body)),
  });
}

describe("POST /applications/:applicationId/workflows/:workflowId/nodes", () => {
  it("validates and dispatches a typed classification condition", async () => {
    const addConditionNode = vi.fn(async () => ({
      ok: true as const,
      draft: { nodes: [] },
      draftRevision: NEXT_REVISION,
    }));
    const { request } = makeApp({ addConditionNode });
    const response = await postWorkflowNode(request, {
      type: "condition",
      sourceNodeId: "model-node",
      label: "roya",
      operator: "gte",
      threshold: 0.7,
    });
    expect(response.status).toBe(200);
    expect(addConditionNode).toHaveBeenCalledWith({
      applicationId: "app-1",
      workflowId: "workflow-1",
      draftRevision: BASE_REVISION,
      userId: "admin",
      sourceNodeId: "model-node",
      label: "roya",
      operator: "gte",
      threshold: 0.7,
    });
  });

  it("rejects arbitrary operators and out of range thresholds", async () => {
    const { request, addConditionNode } = makeApp();
    const response = await postWorkflowNode(request, {
      type: "condition",
      sourceNodeId: "model-node",
      label: "roya",
      operator: "eval",
      threshold: 1.2,
    });
    expect(response.status).toBe(400);
    expect(addConditionNode).not.toHaveBeenCalled();
  });

  it("reports incompatible classification sources without mutating the draft", async () => {
    const { request } = makeApp({
      addConditionNode: async () => ({ ok: false, reason: "incompatibleSource" }),
    });
    const response = await postWorkflowNode(request, {
      type: "condition",
      sourceNodeId: "detection-node",
      label: "roya",
      operator: "gte",
      threshold: 0.7,
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "Esta condición no es compatible con la salida seleccionada.",
    });
  });

  it("maps an incompatible output result to HTTP 409", async () => {
    const addOutputNode = vi.fn(async () => ({
      ok: false as const,
      reason: "incompatibleSource" as const,
    }));
    const { request } = makeApp({ addOutputNode });
    const response = await postWorkflowNode(request, {
      type: "output",
      name: "resultado",
      sourceNodeId: "condition-node",
      sourcePort: "true",
      resultType: "classification",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "El resultado seleccionado no es compatible con la salida.",
    });
    expect(addOutputNode).toHaveBeenCalledWith({
      applicationId: "app-1",
      workflowId: "workflow-1",
      draftRevision: BASE_REVISION,
      userId: "admin",
      name: "resultado",
      sourceNodeId: "condition-node",
      sourcePort: "true",
      resultType: "classification",
    });
  });

  it("preserves the workflow not-found response", async () => {
    const { request } = makeApp({
      addConditionNode: async () => ({ ok: false, reason: "workflowNotFound" }),
    });
    const response = await postWorkflowNode(request, {
      type: "condition",
      sourceNodeId: "model-node",
      label: "roya",
      operator: "gte",
      threshold: 0.7,
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos este workflow.",
      code: "notFound",
    });
  });

  it("dispatches model nodes with the selected version id", async () => {
    const addModelNode = vi.fn(async () => ({
      ok: true as const,
      draft: { nodes: [] },
      draftRevision: NEXT_REVISION,
    }));
    const { request } = makeApp({ addModelNode });

    const response = await postWorkflowNode(request, {
      type: "model.tflite",
      modelVersionId: "mv-1",
    });

    expect(response.status).toBe(200);
    expect(addModelNode).toHaveBeenCalledWith({
      applicationId: "app-1",
      workflowId: "workflow-1",
      draftRevision: BASE_REVISION,
      userId: "admin",
      modelVersionId: "mv-1",
    });
  });

  it("dispatches a model node with the output port it is added after (US-128)", async () => {
    const addModelNode = vi.fn(async () => ({
      ok: true as const,
      draft: { nodes: [] },
      draftRevision: NEXT_REVISION,
    }));
    const { request } = makeApp({ addModelNode });

    const response = await postWorkflowNode(request, {
      type: "model.tflite",
      modelVersionId: "mv-1",
      sourceNodeId: "image-node",
      sourcePort: "imagen",
      position: { x: 400, y: 0 },
    });

    expect(response.status).toBe(200);
    expect(addModelNode).toHaveBeenCalledWith({
      applicationId: "app-1",
      workflowId: "workflow-1",
      draftRevision: BASE_REVISION,
      userId: "admin",
      modelVersionId: "mv-1",
      position: { x: 400, y: 0 },
      source: { nodeId: "image-node", port: "imagen" },
    });
  });

  it.each([
    ["only a source node", { sourceNodeId: "image-node" }],
    ["only a source port", { sourcePort: "imagen" }],
    ["an empty source", { sourceNodeId: "", sourcePort: "imagen" }],
  ])("rejects a model node with %s without adding it", async (_case, source) => {
    const { request, addModelNode } = makeApp();

    const response = await postWorkflowNode(request, {
      type: "model.tflite",
      modelVersionId: "mv-1",
      ...source,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "Selecciona puertos válidos." });
    expect(addModelNode).not.toHaveBeenCalled();
  });

  it("maps a model source port that cannot feed it to HTTP 409", async () => {
    const { request } = makeApp({
      addModelNode: async () => ({ ok: false, reason: "incompatibleSource" }),
    });

    const response = await postWorkflowNode(request, {
      type: "model.tflite",
      modelVersionId: "mv-1",
      sourceNodeId: "model-node",
      sourcePort: "result",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "Estos puertos no son compatibles.",
    });
  });

  it("maps a missing contract to HTTP 409", async () => {
    const { request } = makeApp({
      addModelNode: async () => ({ ok: false, reason: "contractRequired" }),
    });

    const response = await postWorkflowNode(request, {
      type: "model.tflite",
      modelVersionId: "mv-1",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "Esta versión necesita un contrato antes de usarse en un workflow.",
    });
  });

  it("maps a missing model version to a non-disclosing HTTP 404", async () => {
    const { request } = makeApp({
      addModelNode: async () => ({ ok: false, reason: "modelVersionNotFound" }),
    });

    const response = await postWorkflowNode(request, {
      type: "model.tflite",
      modelVersionId: "mv-foreign",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos esta versión de modelo.",
      code: "modelVersionNotFound",
    });
  });

  it("maps a duplicate image-input result to HTTP 409", async () => {
    const addImageInput = vi
      .fn(
        async (_input: AddImageInputInput): Promise<AddImageInputResult> => ({
          ok: true,
          draft: { nodes: [{ id: "node-1", type: "input.image", outputs: { imagen: "image" } }] },
          draftRevision: NEXT_REVISION,
        }),
      )
      .mockResolvedValueOnce({
        ok: true,
        draft: { nodes: [{ id: "node-1", type: "input.image", outputs: { imagen: "image" } }] },
        draftRevision: NEXT_REVISION,
      })
      .mockResolvedValueOnce({ ok: false, reason: "duplicate" });
    const { request } = makeApp({ addImageInput });

    const created = await postWorkflowNode(request, { type: "input.image" });
    expect(created.status).toBe(200);
    await expect(created.json()).resolves.toEqual({
      draft: { nodes: [{ id: "node-1", type: "input.image", outputs: { imagen: "image" } }] },
      draftRevision: NEXT_REVISION,
    });
    const duplicate = await postWorkflowNode(request, { type: "input.image" });
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toEqual({
      message: "Este workflow ya tiene una entrada de imagen.",
    });
  });

  it("allows only administrators to add a node", async () => {
    const { request, addImageInput } = makeApp({
      membershipRole: "member",
      addImageInput: async () => ({ ok: false, reason: "forbidden" }),
    });
    const response = await postWorkflowNode(request, { type: "input.image" });
    expect(response.status).toBe(403);
    expect(addImageInput).toHaveBeenCalledWith({
      applicationId: "app-1",
      workflowId: "workflow-1",
      draftRevision: BASE_REVISION,
      userId: "admin",
    });
  });
});

describe("GET /applications/:applicationId/workflows", () => {
  it("lists the workflows of the application for any workspace member", async () => {
    const { request, list } = makeApp({ membershipRole: "member" });

    const response = await request.request("/applications/app-1/workflows");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ workflows: [sampleWorkflow] });
    expect(list).toHaveBeenCalledWith("app-1");
  });

  it("returns every workflow with its id, name and status", async () => {
    const listedWorkflows: Workflow[] = [
      sampleWorkflow,
      { ...sampleWorkflow, id: "workflow-2", name: "Detección de roya" },
    ];
    const { request } = makeApp({ membershipRole: "member", listedWorkflows });

    const response = await request.request("/applications/app-1/workflows");

    expect(response.status).toBe(200);
    const body = (await response.json()) as { workflows: Workflow[] };
    expect(body.workflows.map(({ id, name, status }) => ({ id, name, status }))).toEqual([
      { id: "workflow-1", name: "Diagnóstico de hoja de café", status: "draft" },
      { id: "workflow-2", name: "Detección de roya", status: "draft" },
    ]);
  });

  it("returns an empty list for an application without workflows", async () => {
    const { request } = makeApp({ listedWorkflows: [] });

    const response = await request.request("/applications/app-1/workflows");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ workflows: [] });
  });

  it("still lists the workflows of an archived application", async () => {
    const { request } = makeApp({ application: { ...activeApplication, status: "archived" } });

    const response = await request.request("/applications/app-1/workflows");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ workflows: [sampleWorkflow] });
  });

  it("requires an authenticated session", async () => {
    const { request, list } = makeApp({ session: null });

    const response = await request.request("/applications/app-1/workflows");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Authentication required" });
    expect(list).not.toHaveBeenCalled();
  });

  it("answers a non-member exactly like a missing application, without listing", async () => {
    const nonMember = makeApp({ membershipRole: null });
    const missing = makeApp({ application: null });

    const nonMemberResponse = await nonMember.request.request("/applications/app-1/workflows");
    const missingResponse = await missing.request.request("/applications/app-1/workflows");

    expect(nonMemberResponse.status).toBe(404);
    expect(missingResponse.status).toBe(404);
    const nonMemberBody = await nonMemberResponse.json();
    expect(nonMemberBody).toEqual({ message: "No encontramos esta aplicación." });
    await expect(missingResponse.json()).resolves.toEqual(nonMemberBody);
    expect(nonMember.list).not.toHaveBeenCalled();
    expect(missing.list).not.toHaveBeenCalled();
  });
});

describe("GET /applications/:applicationId/workflows/:workflowId", () => {
  it("returns the workflow with its draft and published versions to any workspace member", async () => {
    const { request, get } = makeApp({ membershipRole: "member" });

    const response = await request.request("/applications/app-1/workflows/workflow-1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      workflow: sampleWorkflow,
      draft: { nodes: [] },
      draftRevision: 0,
      versions: [],
    });
    expect(get).toHaveBeenCalledWith("app-1", "workflow-1");
  });

  it("still returns the detail of a workflow in an archived application", async () => {
    const { request } = makeApp({ application: { ...activeApplication, status: "archived" } });

    const response = await request.request("/applications/app-1/workflows/workflow-1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(sampleDetail);
  });

  it("requires an authenticated session", async () => {
    const { request, get } = makeApp({ session: null });

    const response = await request.request("/applications/app-1/workflows/workflow-1");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Authentication required" });
    expect(get).not.toHaveBeenCalled();
  });

  it("answers a non-member exactly like a missing application, without reading the workflow", async () => {
    const nonMember = makeApp({ membershipRole: null });
    const missing = makeApp({ application: null });

    const nonMemberResponse = await nonMember.request.request(
      "/applications/app-1/workflows/workflow-1",
    );
    const missingResponse = await missing.request.request(
      "/applications/app-1/workflows/workflow-1",
    );

    expect(nonMemberResponse.status).toBe(404);
    expect(missingResponse.status).toBe(404);
    const nonMemberBody = await nonMemberResponse.json();
    expect(nonMemberBody).toEqual({ message: "No encontramos esta aplicación." });
    await expect(missingResponse.json()).resolves.toEqual(nonMemberBody);
    expect(nonMember.get).not.toHaveBeenCalled();
    expect(missing.get).not.toHaveBeenCalled();
  });

  it("answers 404 when the workflow does not exist in the application", async () => {
    const { request, get } = makeApp({ workflowDetail: null });

    const response = await request.request("/applications/app-1/workflows/workflow-9");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos este workflow.",
      code: "notFound",
    });
    expect(get).toHaveBeenCalledWith("app-1", "workflow-9");
  });
});

describe("GET /applications/:applicationId/workflows/:workflowId/validation", () => {
  const validationPath = "/applications/app-1/workflows/workflow-1/validation";
  const completeDraft: WorkflowDetail["draft"] = {
    nodes: [
      { id: "input", type: "input.image", outputs: { imagen: "image" } },
      {
        id: "classifier",
        type: "model.tflite",
        modelVersionId: "version-1",
        modelName: "Clasificador",
        version: "1.0.0",
        inputs: {
          image: {
            type: "image",
            width: 224,
            height: 224,
            channels: 3,
            normalization: "zero_to_one",
          },
        },
        outputs: { result: { type: "classification", labels: ["sana"] } },
      },
      {
        id: "diagnosis",
        type: "output",
        name: "Diagnóstico",
        sourceNodeId: "classifier",
        sourcePort: "result",
        resultType: "classification",
      },
    ],
    connections: [
      {
        sourceNodeId: "input",
        sourcePort: "imagen",
        targetNodeId: "classifier",
        targetPort: "image",
      },
    ],
  };

  it("confirms that a complete draft is publishable", async () => {
    const { request, get } = makeApp({
      workflowDetail: { ...sampleDetail, draft: completeDraft },
    });

    const response = await request.request(validationPath);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ publishable: true, errors: [] });
    expect(get).toHaveBeenCalledWith("app-1", "workflow-1");
  });

  it("reports the node and port of a disconnected required input without modifying the draft", async () => {
    const app = makeApp({
      membershipRole: "owner",
      workflowDetail: { ...sampleDetail, draft: { ...completeDraft, connections: [] } },
    });

    const response = await app.request.request(validationPath);

    expect(response.status).toBe(200);
    const body = (await response.json()) as WorkflowValidationResult;
    expect(body.publishable).toBe(false);
    expect(body.errors).toContainEqual({
      code: "requiredInput",
      nodeId: "classifier",
      nodeName: "Clasificador",
      port: "image",
      message: 'El nodo "Clasificador" necesita una imagen de entrada.',
    });
    for (const write of [
      app.create,
      app.rename,
      app.addImageInput,
      app.addModelNode,
      app.addConditionNode,
      app.addOutputNode,
      app.addConnection,
      app.removeConnection,
      app.updateNodePositions,
    ])
      expect(write).not.toHaveBeenCalled();
  });

  it("allows only administrators and owners to validate", async () => {
    const { request, get } = makeApp({ membershipRole: "member" });

    const response = await request.request(validationPath);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para validar este workflow.",
    });
    expect(get).not.toHaveBeenCalled();
  });

  it("requires an authenticated session", async () => {
    const { request, get } = makeApp({ session: null });

    const response = await request.request(validationPath);

    expect(response.status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });

  it("answers a non-member exactly like a missing application", async () => {
    const nonMember = makeApp({ membershipRole: null });
    const missing = makeApp({ application: null });

    const nonMemberResponse = await nonMember.request.request(validationPath);
    const missingResponse = await missing.request.request(validationPath);

    expect(nonMemberResponse.status).toBe(404);
    expect(missingResponse.status).toBe(404);
    await expect(nonMemberResponse.json()).resolves.toEqual(await missingResponse.json());
    expect(nonMember.get).not.toHaveBeenCalled();
  });

  it("answers 404 when the workflow does not exist in the application", async () => {
    const { request } = makeApp({ workflowDetail: null });

    const response = await request.request(validationPath);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos este workflow.",
      code: "notFound",
    });
  });
});

describe("POST /applications/:applicationId/workflows/:workflowId/versions", () => {
  function postVersion(request: ReturnType<typeof makeApp>["request"], body: unknown) {
    return request.request("/applications/app-1/workflows/workflow-1/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("publishes the draft as a new version for an administrator", async () => {
    const { request, publishVersion } = makeApp();

    const response = await postVersion(request, { version: " 1.0.0 " });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      version: {
        id: "version-1",
        workflowId: "workflow-1",
        version: "1.0.0",
        createdAt: "2026-09-24T12:00:00.000Z",
      },
    });
    expect(publishVersion).toHaveBeenCalledWith({
      applicationId: "app-1",
      workflowId: "workflow-1",
      userId: "admin",
      version: "1.0.0",
    });
  });

  it.each([
    ["a missing version", {}],
    ["a non-SemVer version", { version: "v1" }],
    ["a version with a leading zero", { version: "01.0.0" }],
  ])("rejects %s with 400 without publishing", async (_caseName, body) => {
    const { request, publishVersion } = makeApp();

    const response = await postVersion(request, body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Ingresa una versión con formato SemVer, por ejemplo 1.0.0.",
    });
    expect(publishVersion).not.toHaveBeenCalled();
  });

  it("rejects a draft that is not publishable with its validation errors", async () => {
    const errors: WorkflowValidationResult["errors"] = [
      {
        code: "missingOutput",
        nodeId: null,
        nodeName: null,
        port: null,
        message: "El workflow necesita al menos un nodo de salida.",
      },
    ];
    const { request } = makeApp({
      publishVersion: async () => ({ ok: false, reason: "invalidDraft", errors }),
    });

    const response = await postVersion(request, { version: "1.0.0" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "Corrige los errores de validación antes de publicar.",
      code: "workflowInvalid",
      errors,
    });
  });

  it("rejects a version identifier the workflow already uses", async () => {
    const { request } = makeApp({
      publishVersion: async () => ({ ok: false, reason: "versionExists" }),
    });

    const response = await postVersion(request, { version: "1.0.0" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "Este workflow ya tiene una versión 1.0.0.",
      code: "versionExists",
    });
  });

  it("maps a plain member to 403 and an archived application to 409", async () => {
    const member = makeApp({
      membershipRole: "member",
      publishVersion: async () => ({ ok: false, reason: "forbidden" }),
    });
    const archived = makeApp({
      publishVersion: async () => ({ ok: false, reason: "archived" }),
    });

    const memberResponse = await postVersion(member.request, { version: "1.0.0" });
    const archivedResponse = await postVersion(archived.request, { version: "1.0.0" });

    expect(memberResponse.status).toBe(403);
    await expect(memberResponse.json()).resolves.toEqual({
      message: "No tienes permiso para publicar este workflow.",
    });
    expect(archivedResponse.status).toBe(409);
    await expect(archivedResponse.json()).resolves.toEqual({
      message: "No puedes publicar versiones en una aplicación archivada.",
      code: "applicationArchived",
    });
  });

  it("answers 404 when the workflow does not exist in the application", async () => {
    const { request } = makeApp({
      publishVersion: async () => ({ ok: false, reason: "workflowNotFound" }),
    });

    const response = await postVersion(request, { version: "1.0.0" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos este workflow.",
      code: "notFound",
    });
  });

  it("answers a non-member exactly like a missing application, without publishing", async () => {
    const nonMember = makeApp({ membershipRole: null });
    const missing = makeApp({ application: null });

    const nonMemberResponse = await postVersion(nonMember.request, { version: "1.0.0" });
    const missingResponse = await postVersion(missing.request, { version: "v1" });

    expect(nonMemberResponse.status).toBe(404);
    expect(missingResponse.status).toBe(404);
    await expect(nonMemberResponse.json()).resolves.toEqual(await missingResponse.json());
    expect(nonMember.publishVersion).not.toHaveBeenCalled();
  });

  it("requires an authenticated session", async () => {
    const { request, publishVersion } = makeApp({ session: null });

    const response = await postVersion(request, { version: "1.0.0" });

    expect(response.status).toBe(401);
    expect(publishVersion).not.toHaveBeenCalled();
  });
});

describe("POST /applications/:applicationId/workflows", () => {
  it("lets an administrator create a draft workflow bound to the application", async () => {
    const { request, create } = makeApp();

    const response = await postWorkflow(request, { name: "Diagnóstico de hoja de café" });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      workflow: {
        id: "workflow-1",
        applicationId: "app-1",
        name: "Diagnóstico de hoja de café",
        status: "draft",
        createdAt: "2026-09-21T15:00:00.000Z",
        updatedAt: "2026-09-21T15:00:00.000Z",
      },
    });
    expect(create).toHaveBeenCalledWith({
      applicationId: "app-1",
      userId: "admin",
      name: "Diagnóstico de hoja de café",
    });
  });

  it("trims the name before creating the workflow", async () => {
    const { request, create } = makeApp();

    const response = await postWorkflow(request, { name: "  Diagnóstico  " });

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith({
      applicationId: "app-1",
      userId: "admin",
      name: "Diagnóstico",
    });
  });

  it.each([
    ["an empty name", { name: "" }],
    ["a whitespace-only name", { name: "   " }],
    ["an omitted name", {}],
    ["a non-string name", { name: 42 }],
  ])("rejects %s with 400 and does not create the workflow", async (_label, body) => {
    const { request, create } = makeApp();

    const response = await postWorkflow(request, body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Ingresa un nombre para el workflow.",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("requires an authenticated session", async () => {
    const { request, create } = makeApp({ session: null });

    const response = await postWorkflow(request, { name: "Diagnóstico" });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Authentication required" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a member without administration permissions with 403", async () => {
    const { request, create } = makeApp({
      membershipRole: "member",
      create: async () => ({ ok: false, reason: "forbidden" }),
    });

    const response = await postWorkflow(request, { name: "Diagnóstico" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para crear workflows.",
    });
    expect(create).toHaveBeenCalledWith({
      applicationId: "app-1",
      userId: "admin",
      name: "Diagnóstico",
    });
  });

  it("rejects an archived application with the applicationArchived code and status 409", async () => {
    const { request } = makeApp({
      create: async () => ({ ok: false, reason: "archived" }),
    });

    const response = await postWorkflow(request, { name: "Diagnóstico" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "No puedes crear workflows en una aplicación archivada.",
      code: "applicationArchived",
    });
  });

  it("returns not found when the store no longer finds the application", async () => {
    const { request } = makeApp({
      create: async () => ({ ok: false, reason: "notFound" }),
    });

    const response = await postWorkflow(request, { name: "Diagnóstico" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos esta aplicación.",
    });
  });

  it("returns not found when the application does not exist", async () => {
    const { request, create } = makeApp({ application: null });

    const response = await postWorkflow(request, { name: "Diagnóstico" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos esta aplicación.",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("does not reveal the application to non-members, even with an invalid body", async () => {
    const { request, create } = makeApp({ membershipRole: null });

    const invalidBody = await postWorkflow(request, { name: "" });
    const validBody = await postWorkflow(request, { name: "Diagnóstico" });

    for (const response of [invalidBody, validBody]) {
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        message: "No encontramos esta aplicación.",
      });
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a body that is not valid JSON with 400", async () => {
    const { request, create } = makeApp();

    const response = await request.request("/applications/app-1/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Ingresa un nombre para el workflow.",
    });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("PATCH /applications/:applicationId/workflows/:workflowId", () => {
  it("lets an administrator rename a workflow", async () => {
    const { request, rename } = makeApp();

    const response = await patchWorkflow(request, { name: "Nuevo nombre" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      workflow: {
        id: "workflow-1",
        applicationId: "app-1",
        name: "Nuevo nombre",
        status: "draft",
        createdAt: "2026-09-21T15:00:00.000Z",
        updatedAt: "2026-09-22T09:00:00.000Z",
      },
    });
    expect(rename).toHaveBeenCalledWith({
      applicationId: "app-1",
      workflowId: "workflow-1",
      userId: "admin",
      name: "Nuevo nombre",
    });
  });

  it("lets an owner rename a workflow too", async () => {
    const { request, rename } = makeApp({
      membershipRole: "owner",
      session: { user: { id: "owner-user" } },
    });

    const response = await patchWorkflow(request, { name: "Nuevo nombre" });

    expect(response.status).toBe(200);
    expect(rename).toHaveBeenCalledWith({
      applicationId: "app-1",
      workflowId: "workflow-1",
      userId: "owner-user",
      name: "Nuevo nombre",
    });
  });

  it("trims the name before renaming the workflow", async () => {
    const { request, rename } = makeApp();

    const response = await patchWorkflow(request, { name: "  Nuevo  nombre  " });

    expect(response.status).toBe(200);
    expect(rename).toHaveBeenCalledWith({
      applicationId: "app-1",
      workflowId: "workflow-1",
      userId: "admin",
      name: "Nuevo  nombre",
    });
  });

  it.each([
    ["an empty name", { name: "" }],
    ["a whitespace-only name", { name: "   " }],
    ["an omitted name", {}],
    ["a non-string name", { name: 42 }],
  ])("rejects %s with 400 and does not rename the workflow", async (_label, body) => {
    const { request, rename } = makeApp();

    const response = await patchWorkflow(request, body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Ingresa un nombre para el workflow.",
    });
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects a body that is not valid JSON with 400", async () => {
    const { request, rename } = makeApp();

    const response = await request.request("/applications/app-1/workflows/workflow-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Ingresa un nombre para el workflow.",
    });
    expect(rename).not.toHaveBeenCalled();
  });

  it("requires an authenticated session", async () => {
    const { request, rename } = makeApp({ session: null });

    const response = await patchWorkflow(request, { name: "Nuevo nombre" });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Authentication required" });
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects a member without administration permissions with 403", async () => {
    const { request, rename } = makeApp({
      membershipRole: "member",
      rename: async () => ({ ok: false, reason: "forbidden" }),
    });

    const response = await patchWorkflow(request, { name: "Nuevo nombre" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para editar este workflow.",
    });
    expect(rename).toHaveBeenCalledWith({
      applicationId: "app-1",
      workflowId: "workflow-1",
      userId: "admin",
      name: "Nuevo nombre",
    });
  });

  it("rejects an archived application with the applicationArchived code and status 409", async () => {
    const { request } = makeApp({
      rename: async () => ({ ok: false, reason: "archived" }),
    });

    const response = await patchWorkflow(request, { name: "Nuevo nombre" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "No puedes editar workflows en una aplicación archivada.",
      code: "applicationArchived",
    });
  });

  it("returns not found with code notFound when the workflow does not exist in the application", async () => {
    const { request, rename } = makeApp({
      rename: async () => ({ ok: false, reason: "workflowNotFound" }),
    });

    const response = await patchWorkflow(request, { name: "Nuevo nombre" }, "workflow-9");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos este workflow.",
      code: "notFound",
    });
    expect(rename).toHaveBeenCalledWith({
      applicationId: "app-1",
      workflowId: "workflow-9",
      userId: "admin",
      name: "Nuevo nombre",
    });
  });

  it("returns not found when the store no longer finds the application", async () => {
    const { request } = makeApp({
      rename: async () => ({ ok: false, reason: "notFound" }),
    });

    const response = await patchWorkflow(request, { name: "Nuevo nombre" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos esta aplicación.",
    });
  });

  it("returns not found when the application does not exist", async () => {
    const { request, rename } = makeApp({ application: null });

    const response = await patchWorkflow(request, { name: "Nuevo nombre" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos esta aplicación.",
    });
    expect(rename).not.toHaveBeenCalled();
  });

  it("answers a non-member exactly like a missing application, with a valid or invalid body, without renaming", async () => {
    const nonMember = makeApp({ membershipRole: null });
    const missing = makeApp({ application: null });

    const responses = await Promise.all([
      patchWorkflow(nonMember.request, { name: "" }),
      patchWorkflow(nonMember.request, { name: "Nuevo nombre" }),
      patchWorkflow(missing.request, { name: "" }),
      patchWorkflow(missing.request, { name: "Nuevo nombre" }),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        message: "No encontramos esta aplicación.",
      });
    }
    expect(nonMember.rename).not.toHaveBeenCalled();
    expect(missing.rename).not.toHaveBeenCalled();
  });
});

describe("POST /applications/:applicationId/workflows/:workflowId/archive", () => {
  function archiveRequest(
    request: ReturnType<typeof makeApp>["request"],
    workflowId = "workflow-1",
  ) {
    return request.request(`/applications/app-1/workflows/${workflowId}/archive`, {
      method: "POST",
    });
  }

  it("lets an administrator archive a workflow and answers the archived workflow", async () => {
    const { request, archive } = makeApp();

    const response = await archiveRequest(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      workflow: { ...sampleWorkflow, status: "archived", updatedAt: "2026-09-24T12:00:00.000Z" },
    });
    expect(archive).toHaveBeenCalledWith({
      applicationId: "app-1",
      workflowId: "workflow-1",
      userId: "admin",
    });
  });

  it("rejects a member without administration permissions with 403", async () => {
    const { request } = makeApp({
      membershipRole: "member",
      archive: async () => ({ ok: false, reason: "forbidden" }),
    });

    const response = await archiveRequest(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para archivar este workflow.",
    });
  });

  it("rejects an archived application with the applicationArchived code and status 409", async () => {
    const { request } = makeApp({ archive: async () => ({ ok: false, reason: "archived" }) });

    const response = await archiveRequest(request);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "No puedes editar workflows en una aplicación archivada.",
      code: "applicationArchived",
    });
  });

  it("returns not found with code notFound when the workflow does not exist in the application", async () => {
    const { request } = makeApp({
      archive: async () => ({ ok: false, reason: "workflowNotFound" }),
    });

    const response = await archiveRequest(request, "workflow-9");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No encontramos este workflow.",
      code: "notFound",
    });
  });

  it("requires an authenticated session", async () => {
    const { request, archive } = makeApp({ session: null });

    const response = await archiveRequest(request);

    expect(response.status).toBe(401);
    expect(archive).not.toHaveBeenCalled();
  });

  it("answers a non-member exactly like a missing application, without archiving", async () => {
    const nonMember = makeApp({ membershipRole: null });
    const missing = makeApp({ application: null });

    for (const { request, archive } of [nonMember, missing]) {
      const response = await archiveRequest(request);
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        message: "No encontramos esta aplicación.",
      });
      expect(archive).not.toHaveBeenCalled();
    }
  });
});

type FakeTransactionState = {
  application: Record<string, unknown> | undefined;
  membership: Record<string, unknown> | undefined;
  inserted: Record<string, unknown>[];
};

function makeTransactionDb(state: FakeTransactionState) {
  const values = vi.fn((value: Record<string, unknown>) => {
    const row = {
      id: value.id,
      applicationId: value.applicationId,
      name: value.name,
      status: value.status,
      createdAt: new Date("2026-09-21T15:00:00.000Z"),
      updatedAt: new Date("2026-09-21T15:00:00.000Z"),
    };
    state.inserted.push(row);
    return { returning: async () => [row] };
  });

  let selectCount = 0;
  const executor: TransactionExecutor = {
    select: (fields: Record<string, unknown>) => {
      void fields;
      const rows =
        selectCount === 0
          ? state.application
            ? [state.application]
            : []
          : state.membership
            ? [state.membership]
            : [];
      selectCount += 1;
      return {
        from: (table: unknown) => {
          void table;
          return {
            where: (condition: unknown) => {
              void condition;
              return {
                limit: (count: number) => {
                  void count;
                  return {
                    for: (strength: "update") => {
                      void strength;
                      return Promise.resolve(rows);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    insert: (table: unknown) => {
      void table;
      return { values };
    },
  };

  return {
    values,
    inserted: state.inserted,
    db: {
      transaction: <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        selectCount = 0;
        return callback(executor);
      },
    },
  };
}

describe("createWorkflow", () => {
  it("creates a draft workflow for an administrator of an active application", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "admin" },
      inserted: [],
    });

    const result = await createWorkflow(transaction.db, {
      applicationId: "app-1",
      userId: "admin",
      name: "Diagnóstico de hoja de café",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workflow).toEqual({
        id: expect.any(String),
        applicationId: "app-1",
        name: "Diagnóstico de hoja de café",
        status: "draft",
        createdAt: "2026-09-21T15:00:00.000Z",
        updatedAt: "2026-09-21T15:00:00.000Z",
      });
    }
    expect(transaction.values).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "app-1",
        name: "Diagnóstico de hoja de café",
        status: "draft",
      }),
    );
  });

  it("lets an owner create a workflow too", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "owner" },
      inserted: [],
    });

    const result = await createWorkflow(transaction.db, {
      applicationId: "app-1",
      userId: "owner",
      name: "Diagnóstico",
    });

    expect(result.ok).toBe(true);
    expect(transaction.inserted).toHaveLength(1);
  });

  it("checks membership before checking archived status", async () => {
    const nonMemberTx = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: undefined,
      inserted: [],
    });

    const nonMemberResult = await createWorkflow(nonMemberTx.db, {
      applicationId: "app-1",
      userId: "stranger",
      name: "Diagnóstico",
    });

    expect(nonMemberResult).toEqual({ ok: false, reason: "notFound" });

    const memberTx = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: { role: "member" },
      inserted: [],
    });

    const memberResult = await createWorkflow(memberTx.db, {
      applicationId: "app-1",
      userId: "regular-user",
      name: "Diagnóstico",
    });

    expect(memberResult).toEqual({ ok: false, reason: "forbidden" });
    expect(nonMemberTx.inserted).toHaveLength(0);
    expect(memberTx.inserted).toHaveLength(0);
  });

  it("rejects a plain member of an active application without inserting a workflow", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "member" },
      inserted: [],
    });

    const result = await createWorkflow(transaction.db, {
      applicationId: "app-1",
      userId: "regular-user",
      name: "Diagnóstico",
    });

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(transaction.inserted).toHaveLength(0);
  });

  it("rejects an archived application without inserting a workflow", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: { role: "admin" },
      inserted: [],
    });

    const result = await createWorkflow(transaction.db, {
      applicationId: "app-1",
      userId: "admin",
      name: "Diagnóstico",
    });

    expect(result).toEqual({ ok: false, reason: "archived" });
    expect(transaction.inserted).toHaveLength(0);
  });

  it("returns notFound when the application does not exist", async () => {
    const transaction = makeTransactionDb({
      application: undefined,
      membership: { role: "admin" },
      inserted: [],
    });

    const result = await createWorkflow(transaction.db, {
      applicationId: "missing-app",
      userId: "admin",
      name: "Diagnóstico",
    });

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(transaction.inserted).toHaveLength(0);
  });
});

type FakeRenameTransactionState = {
  application: Record<string, unknown> | undefined;
  membership: Record<string, unknown> | undefined;
  returning: Record<string, unknown>[];
};

function makeRenameTransactionDb(state: FakeRenameTransactionState) {
  const setCalls: Record<string, unknown>[] = [];
  const whereCalls: unknown[] = [];

  const set = vi.fn((value: Record<string, unknown>) => {
    setCalls.push(value);
    return {
      where: (condition: unknown) => {
        whereCalls.push(condition);
        return { returning: async () => state.returning };
      },
    };
  });

  const update = vi.fn((table: unknown) => {
    void table;
    return { set };
  });

  let selectCount = 0;
  const executor = {
    select: (fields: Record<string, unknown>) => {
      void fields;
      const rows =
        selectCount === 0
          ? state.application
            ? [state.application]
            : []
          : state.membership
            ? [state.membership]
            : [];
      selectCount += 1;
      return {
        from: (table: unknown) => {
          void table;
          return {
            where: (condition: unknown) => {
              void condition;
              return {
                limit: (count: number) => {
                  void count;
                  return {
                    for: (strength: "update") => {
                      void strength;
                      return Promise.resolve(rows);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    update,
  };

  return {
    update,
    set,
    setCalls,
    whereCalls,
    db: {
      transaction: <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        selectCount = 0;
        return callback(executor);
      },
    },
  };
}

const renamedRow = {
  id: "workflow-1",
  applicationId: "app-1",
  name: "Nuevo nombre",
  status: "draft",
  createdAt: new Date("2026-09-21T15:00:00.000Z"),
  updatedAt: new Date("2026-09-22T09:00:00.000Z"),
};

describe("renameWorkflow", () => {
  it("renames a workflow for an administrator of an active application", async () => {
    const transaction = makeRenameTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "admin" },
      returning: [renamedRow],
    });

    const result = await renameWorkflow(transaction.db, {
      applicationId: "app-1",
      workflowId: "workflow-1",
      userId: "admin",
      name: "Nuevo nombre",
    });

    expect(result).toEqual({
      ok: true,
      workflow: {
        id: "workflow-1",
        applicationId: "app-1",
        name: "Nuevo nombre",
        status: "draft",
        createdAt: "2026-09-21T15:00:00.000Z",
        updatedAt: "2026-09-22T09:00:00.000Z",
      },
    });
  });

  it("lets an owner rename a workflow too", async () => {
    const transaction = makeRenameTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "owner" },
      returning: [renamedRow],
    });

    const result = await renameWorkflow(transaction.db, {
      applicationId: "app-1",
      workflowId: "workflow-1",
      userId: "owner",
      name: "Nuevo nombre",
    });

    expect(result.ok).toBe(true);
    expect(transaction.update).toHaveBeenCalledTimes(1);
  });

  it("updates exclusively the name, never the id, applicationId or status", async () => {
    const transaction = makeRenameTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "admin" },
      returning: [renamedRow],
    });

    await renameWorkflow(transaction.db, {
      applicationId: "app-1",
      workflowId: "workflow-1",
      userId: "admin",
      name: "Nuevo nombre",
    });

    expect(transaction.setCalls).toEqual([{ name: "Nuevo nombre" }]);
  });

  it("scopes the update to the workflow id and its owning application", async () => {
    const transaction = makeRenameTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "admin" },
      returning: [renamedRow],
    });

    await renameWorkflow(transaction.db, {
      applicationId: "app-1",
      workflowId: "workflow-1",
      userId: "admin",
      name: "Nuevo nombre",
    });

    expect(transaction.whereCalls).toHaveLength(1);
    expect(toQuery(transaction.whereCalls[0])).toEqual({
      sql: '("workflow"."id" = $1 and "workflow"."application_id" = $2)',
      params: ["workflow-1", "app-1"],
    });
  });

  it("rejects a plain member without updating the workflow", async () => {
    const transaction = makeRenameTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "member" },
      returning: [],
    });

    const result = await renameWorkflow(transaction.db, {
      applicationId: "app-1",
      workflowId: "workflow-1",
      userId: "regular-user",
      name: "Nuevo nombre",
    });

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it("rejects an archived application without updating the workflow", async () => {
    const transaction = makeRenameTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: { role: "admin" },
      returning: [],
    });

    const result = await renameWorkflow(transaction.db, {
      applicationId: "app-1",
      workflowId: "workflow-1",
      userId: "admin",
      name: "Nuevo nombre",
    });

    expect(result).toEqual({ ok: false, reason: "archived" });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it("returns notFound for a non-member or a missing application, without updating", async () => {
    const nonMemberTx = makeRenameTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: undefined,
      returning: [],
    });

    const nonMemberResult = await renameWorkflow(nonMemberTx.db, {
      applicationId: "app-1",
      workflowId: "workflow-1",
      userId: "stranger",
      name: "Nuevo nombre",
    });

    expect(nonMemberResult).toEqual({ ok: false, reason: "notFound" });

    const missingAppTx = makeRenameTransactionDb({
      application: undefined,
      membership: { role: "admin" },
      returning: [],
    });

    const missingAppResult = await renameWorkflow(missingAppTx.db, {
      applicationId: "missing-app",
      workflowId: "workflow-1",
      userId: "admin",
      name: "Nuevo nombre",
    });

    expect(missingAppResult).toEqual({ ok: false, reason: "notFound" });
    expect(nonMemberTx.update).not.toHaveBeenCalled();
    expect(missingAppTx.update).not.toHaveBeenCalled();
  });

  it("returns workflowNotFound when the update matches no row of that application", async () => {
    const transaction = makeRenameTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "admin" },
      returning: [],
    });

    const result = await renameWorkflow(transaction.db, {
      applicationId: "app-1",
      workflowId: "workflow-9",
      userId: "admin",
      name: "Nuevo nombre",
    });

    expect(result).toEqual({ ok: false, reason: "workflowNotFound" });
    expect(transaction.update).toHaveBeenCalledTimes(1);
  });
});

describe("archiveWorkflow", () => {
  const archivedRow = { ...renamedRow, name: "Diagnóstico de hoja de café", status: "archived" };
  const archiveInput = { applicationId: "app-1", workflowId: "workflow-1", userId: "admin" };

  it("archives a workflow of an active application for an administrator", async () => {
    const transaction = makeRenameTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "admin" },
      returning: [archivedRow],
    });

    const result = await archiveWorkflow(transaction.db, archiveInput);

    expect(result).toEqual({
      ok: true,
      workflow: {
        id: "workflow-1",
        applicationId: "app-1",
        name: "Diagnóstico de hoja de café",
        status: "archived",
        createdAt: "2026-09-21T15:00:00.000Z",
        updatedAt: "2026-09-22T09:00:00.000Z",
      },
    });
  });

  it("changes only the status, keeping the draft and never touching published versions", async () => {
    const transaction = makeRenameTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "owner" },
      returning: [archivedRow],
    });

    await archiveWorkflow(transaction.db, archiveInput);

    expect(transaction.update).toHaveBeenCalledTimes(1);
    expect(transaction.update).toHaveBeenCalledWith(workflow);
    expect(transaction.setCalls).toEqual([{ status: "archived" }]);
    expect(toQuery(transaction.whereCalls[0])).toEqual({
      sql: '("workflow"."id" = $1 and "workflow"."application_id" = $2)',
      params: ["workflow-1", "app-1"],
    });
  });

  it("rejects a plain member and leaves the workflow status unchanged", async () => {
    const transaction = makeRenameTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "member" },
      returning: [],
    });

    const result = await archiveWorkflow(transaction.db, archiveInput);

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it("rejects an archived application without updating the workflow", async () => {
    const transaction = makeRenameTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: { role: "admin" },
      returning: [],
    });

    const result = await archiveWorkflow(transaction.db, archiveInput);

    expect(result).toEqual({ ok: false, reason: "archived" });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it("returns notFound for a non-member and workflowNotFound for a workflow outside the application", async () => {
    const nonMemberTx = makeRenameTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: undefined,
      returning: [],
    });
    const missingWorkflowTx = makeRenameTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "admin" },
      returning: [],
    });

    await expect(archiveWorkflow(nonMemberTx.db, archiveInput)).resolves.toEqual({
      ok: false,
      reason: "notFound",
    });
    await expect(archiveWorkflow(missingWorkflowTx.db, archiveInput)).resolves.toEqual({
      ok: false,
      reason: "workflowNotFound",
    });
    expect(nonMemberTx.update).not.toHaveBeenCalled();
  });
});

function makeListDb(rows: Record<string, unknown>[]) {
  const selectedFields: Record<string, unknown>[] = [];
  const filters: unknown[] = [];
  const orderings: unknown[] = [];

  const executor = {
    select: (fields: Record<string, unknown>) => {
      selectedFields.push(fields);
      return {
        from: (table: unknown) => {
          void table;
          return {
            where: (condition: unknown) => {
              filters.push(condition);
              return {
                orderBy: async (column: unknown) => {
                  orderings.push(column);
                  return rows;
                },
              };
            },
          };
        },
      };
    },
  };

  return {
    selectedFields,
    filters,
    orderings,
    db: {
      transaction: <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(executor),
    },
  };
}

function toQuery(fragment: unknown) {
  const { sql, params } = new PgDialect().sqlToQuery(
    fragment as Parameters<PgDialect["sqlToQuery"]>[0],
  );
  return { sql, params };
}

describe("addConditionNode source validation", () => {
  const input = {
    applicationId: "app-1",
    workflowId: "workflow-1",
    userId: "admin",
    draftRevision: 0,
    label: "roya",
    operator: "gte" as const,
    threshold: 0.7,
  };
  const modelNode = {
    id: "classification-1",
    type: "model.tflite" as const,
    modelVersionId: "version-1",
    modelName: "Hoja",
    version: "1.0.0",
    inputs: {
      image: {
        type: "image" as const,
        width: 32,
        height: 32,
        channels: 3 as const,
        normalization: "none" as const,
      },
    },
    outputs: { result: { type: "classification" as const, labels: ["roya"] } },
  };

  it.each([
    ["missing source", [modelNode], "missing"],
    [
      "non-classification source",
      [
        {
          ...modelNode,
          outputs: {
            result: { type: "detection" as const, labels: ["roya"], scoreThreshold: 0.5 },
          },
        },
      ],
      modelNode.id,
    ],
    [
      "undeclared label",
      [
        {
          ...modelNode,
          outputs: { result: { type: "classification" as const, labels: ["sana"] } },
        },
      ],
      modelNode.id,
    ],
  ])("rejects a %s without persisting a node", async (_caseName, nodes, sourceNodeId) => {
    const store = makeWorkflowPositionStoreDb({ nodes });
    const originalDraft = store.reload();
    const result = await addConditionNode(store.db, { ...input, sourceNodeId });
    expect(result).toEqual({ ok: false, reason: "incompatibleSource" });
    expect(store.reload()).toEqual(originalDraft);
    expect(store.writes).toBe(0);
  });

  it("persists and reloads a condition with its typed source and branches", async () => {
    const store = makeWorkflowPositionStoreDb({ nodes: [modelNode] });
    const result = await addConditionNode(store.db, {
      ...input,
      sourceNodeId: modelNode.id,
    });
    expect(result).toEqual({
      ok: true,
      draft: {
        nodes: [
          modelNode,
          {
            id: expect.any(String),
            type: "condition",
            sourceNodeId: modelNode.id,
            label: input.label,
            operator: input.operator,
            threshold: input.threshold,
            branches: { true: "Verdadero", false: "Falso" },
          },
        ],
      },
      draftRevision: 1,
    });
    const savedCondition = result.ok ? result.draft.nodes[1] : undefined;
    const reloadedCondition = store.reload().nodes[1];
    expect(reloadedCondition).toEqual(savedCondition);
    expect(store.writes).toBe(1);
  });
});

describe("addImageInputNode", () => {
  it("persists one image input, rejects a duplicate, and reloads the unchanged draft", async () => {
    const store = makeWorkflowPositionStoreDb({ nodes: [] });
    const input = { applicationId: "app-1", workflowId: "workflow-1", userId: "admin" };

    const first = await addImageInputNode(store.db, { ...input, draftRevision: 0 });
    expect(first).toEqual({
      ok: true,
      draft: {
        nodes: [{ id: expect.any(String), type: "input.image", outputs: { imagen: "image" } }],
      },
      draftRevision: 1,
    });
    const savedDraft = store.reload();
    expect(savedDraft).toEqual(first.ok ? first.draft : undefined);

    const duplicate = await addImageInputNode(store.db, { ...input, draftRevision: 1 });
    expect(duplicate).toEqual({ ok: false, reason: "duplicate" });
    expect(store.reload()).toEqual(savedDraft);
    expect(store.writes).toBe(1);
    expect(store.lockedTables).toContain(workflow);
  });
});

describe("listWorkflows", () => {
  it("maps rows to workflows with ISO dates and the draft status", async () => {
    const transaction = makeListDb([
      {
        id: "workflow-1",
        applicationId: "app-1",
        name: "Diagnóstico de hoja de café",
        status: "draft",
        createdAt: new Date("2026-09-21T15:00:00.000Z"),
        updatedAt: new Date("2026-09-21T16:00:00.000Z"),
      },
      {
        id: "workflow-2",
        applicationId: "app-1",
        name: "Detección de roya",
        status: "draft",
        createdAt: "2026-09-21T15:30:00.000Z",
        updatedAt: "2026-09-21T15:30:00.000Z",
        latestVersion: "1.2.0",
      },
    ]);

    const workflows = await listWorkflows(transaction.db, "app-1");

    expect(workflows).toEqual([
      {
        id: "workflow-1",
        applicationId: "app-1",
        name: "Diagnóstico de hoja de café",
        status: "draft",
        createdAt: "2026-09-21T15:00:00.000Z",
        updatedAt: "2026-09-21T16:00:00.000Z",
        latestVersion: null,
      },
      {
        id: "workflow-2",
        applicationId: "app-1",
        name: "Detección de roya",
        status: "draft",
        createdAt: "2026-09-21T15:30:00.000Z",
        updatedAt: "2026-09-21T15:30:00.000Z",
        latestVersion: "1.2.0",
      },
    ]);
  });

  it("selects the most recently published version of each workflow as its latest version", async () => {
    const transaction = makeListDb([]);

    await listWorkflows(transaction.db, "app-1");

    expect(toQuery(transaction.selectedFields[0]?.latestVersion)).toEqual({
      sql: '(select "workflow_version"."version" from "workflow_version" where "workflow_version"."workflow_id" = "workflow"."id" order by "workflow_version"."created_at" desc limit 1)',
      params: [],
    });
  });

  it("scopes the query to the requested application only", async () => {
    const transaction = makeListDb([]);

    const workflows = await listWorkflows(transaction.db, "app-1");

    expect(workflows).toEqual([]);
    expect(transaction.selectedFields[0]).not.toHaveProperty("organizationId");
    expect(transaction.filters).toHaveLength(1);
    expect(toQuery(transaction.filters[0])).toEqual({
      sql: '"workflow"."application_id" = $1',
      params: ["app-1"],
    });
  });

  it("returns the oldest workflows first", async () => {
    const transaction = makeListDb([]);

    await listWorkflows(transaction.db, "app-1");

    expect(transaction.orderings).toHaveLength(1);
    expect(toQuery(transaction.orderings[0])).toEqual({
      sql: '"workflow"."created_at" asc',
      params: [],
    });
  });
});

function makeGetDb(rows: Record<string, unknown>[], versionRows: Record<string, unknown>[] = []) {
  const filters: unknown[] = [];
  const limits: number[] = [];
  const versionFilters: unknown[] = [];
  const versionOrderings: unknown[] = [];

  const executor = {
    select: (_fields: Record<string, unknown>) => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => {
          if (table === workflowVersion) {
            versionFilters.push(condition);
            return {
              orderBy: async (column: unknown) => {
                versionOrderings.push(column);
                return versionRows;
              },
            };
          }
          filters.push(condition);
          return {
            limit: async (count: number) => {
              limits.push(count);
              return rows;
            },
          };
        },
      }),
    }),
  };

  return {
    filters,
    limits,
    versionFilters,
    versionOrderings,
    db: {
      transaction: <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(executor),
    },
  };
}

describe("getWorkflow", () => {
  it("returns the workflow with an empty draft and no published versions", async () => {
    const transaction = makeGetDb([
      {
        id: "workflow-1",
        applicationId: "app-1",
        name: "Diagnóstico de hoja de café",
        status: "draft",
        createdAt: new Date("2026-09-21T15:00:00.000Z"),
        updatedAt: "2026-09-21T16:00:00.000Z",
        draftRevision: 7,
      },
    ]);

    const detail = await getWorkflow(transaction.db, "app-1", "workflow-1");

    expect(detail).toEqual({
      workflow: sampleWorkflow,
      draft: { nodes: [] },
      draftRevision: 7,
      versions: [],
    });
  });

  it("scopes the query to the workflow and its owning application", async () => {
    const transaction = makeGetDb([]);

    await getWorkflow(transaction.db, "app-1", "workflow-1");

    expect(transaction.filters).toHaveLength(1);
    expect(toQuery(transaction.filters[0])).toEqual({
      sql: '("workflow"."id" = $1 and "workflow"."application_id" = $2)',
      params: ["workflow-1", "app-1"],
    });
    expect(transaction.limits).toEqual([1]);
  });

  it("returns undefined when no workflow of that application matches", async () => {
    const transaction = makeGetDb([]);

    await expect(getWorkflow(transaction.db, "app-1", "workflow-9")).resolves.toBeUndefined();
    expect(transaction.versionFilters).toHaveLength(0);
  });

  it("returns the published versions of the workflow, most recent first", async () => {
    const transaction = makeGetDb(
      [
        {
          id: "workflow-1",
          applicationId: "app-1",
          name: "Diagnóstico de hoja de café",
          status: "draft",
          createdAt: new Date("2026-09-21T15:00:00.000Z"),
          updatedAt: "2026-09-21T16:00:00.000Z",
        },
      ],
      [
        {
          id: "version-2",
          workflowId: "workflow-1",
          version: "1.1.0",
          createdAt: new Date("2026-09-24T12:00:00.000Z"),
        },
      ],
    );

    const detail = await getWorkflow(transaction.db, "app-1", "workflow-1");

    expect(detail?.versions).toEqual([
      {
        id: "version-2",
        workflowId: "workflow-1",
        version: "1.1.0",
        createdAt: "2026-09-24T12:00:00.000Z",
      },
    ]);
    expect(toQuery(transaction.versionFilters[0])).toEqual({
      sql: '"workflow_version"."workflow_id" = $1',
      params: ["workflow-1"],
    });
    expect(toQuery(transaction.versionOrderings[0])).toEqual({
      sql: '"workflow_version"."created_at" desc',
      params: [],
    });
  });
});

describe("updateWorkflowNodePositions", () => {
  const positionedDraft = {
    nodes: [
      { id: "node-1", type: "input.image" as const, outputs: { imagen: "image" as const } },
      {
        id: "node-2",
        type: "condition" as const,
        sourceNodeId: "node-1",
        label: "perro",
        operator: "gte" as const,
        threshold: 0.8,
        branches: { true: "Verdadero" as const, false: "Falso" as const },
      },
      {
        id: "node-3",
        type: "output" as const,
        name: "Resultado",
        sourceNodeId: "node-2",
        sourcePort: "true",
        resultType: "boolean" as const,
      },
    ],
    connections: [
      {
        sourceNodeId: "node-1",
        sourcePort: "imagen",
        targetNodeId: "node-2",
        targetPort: "image",
      },
    ],
    layout: { "node-2": { x: 320, y: 48 }, "node-3": { x: 640, y: 48 } },
  };

  it("saves every moved node in one write without changing nodes or connections", async () => {
    const store = makeWorkflowPositionStoreDb(positionedDraft);
    const result = await updateWorkflowNodePositions(store.db, {
      applicationId: "app-1",
      workflowId: "workflow-1",
      userId: "admin",
      draftRevision: 0,
      positions: { "node-1": { x: -64, y: -32 }, "node-2": { x: 128, y: 256 } },
    });

    expect(result).toEqual({
      ok: true,
      positions: { "node-1": { x: -64, y: -32 }, "node-2": { x: 128, y: 256 } },
      draftRevision: 1,
    });
    expect(store.writes).toBe(1);
    expect(store.reload()).toEqual({
      ...positionedDraft,
      layout: {
        "node-1": { x: -64, y: -32 },
        "node-2": { x: 128, y: 256 },
        "node-3": { x: 640, y: 48 },
      },
    });
    expect(store.lockedTables).toContain(workflow);
  });

  it("saves no position when one of the moved nodes no longer exists", async () => {
    const store = makeWorkflowPositionStoreDb(positionedDraft);
    const result = await updateWorkflowNodePositions(store.db, {
      applicationId: "app-1",
      workflowId: "workflow-1",
      userId: "admin",
      draftRevision: 0,
      positions: { "node-1": { x: 16, y: 16 }, "missing-node": { x: 128, y: 256 } },
    });

    expect(result).toEqual({ ok: false, reason: "nodeNotFound" });
    expect(store.writes).toBe(0);
    expect(store.reload()).toEqual(positionedDraft);
  });
});

describe("addWorkflowConnection", () => {
  const imageNode = (id: string) => ({
    id,
    type: "input.image" as const,
    outputs: { imagen: "image" as const },
  });
  const connectedDraft = {
    nodes: [
      imageNode("image-1"),
      imageNode("image-2"),
      {
        id: "model",
        type: "model.tflite" as const,
        modelVersionId: "version-1",
        modelName: "Classifier",
        version: "1.0.0",
        inputs: {
          image: {
            type: "image" as const,
            width: 224,
            height: 224,
            channels: 3 as const,
            normalization: "none" as const,
          },
        },
        outputs: { result: { type: "classification" as const, labels: ["ok"] } },
      },
    ],
    connections: [
      { sourceNodeId: "image-1", sourcePort: "imagen", targetNodeId: "model", targetPort: "image" },
    ],
  };
  const connectionInput = {
    applicationId: "app-1",
    workflowId: "workflow-1",
    userId: "admin",
    draftRevision: 0,
    sourcePort: "imagen",
    targetNodeId: "model",
    targetPort: "image",
  };

  it("rejects a second connection to a model image input without writing", async () => {
    const store = makeWorkflowPositionStoreDb(connectedDraft);
    const result = await addWorkflowConnection(store.db, {
      ...connectionInput,
      sourceNodeId: "image-2",
    });

    expect(result).toEqual({ ok: false, reason: "incompatible" });
    expect(store.writes).toBe(0);
    expect(store.reload()).toEqual(connectedDraft);
  });

  it("still reports the same connection as a duplicate", async () => {
    const store = makeWorkflowPositionStoreDb(connectedDraft);
    const result = await addWorkflowConnection(store.db, {
      ...connectionInput,
      sourceNodeId: "image-1",
    });

    expect(result).toEqual({ ok: false, reason: "duplicate" });
    expect(store.writes).toBe(0);
  });
});

describe("addModelNode after an output port (US-128)", () => {
  const contract = {
    input: {
      type: "image" as const,
      width: 224,
      height: 224,
      channels: 3 as const,
      normalization: "none" as const,
    },
    output: { type: "classification" as const, labels: ["roya", "sana"] },
  };
  const imageNode = {
    id: "image",
    type: "input.image" as const,
    outputs: { imagen: "image" as const },
  };
  const existingModel = {
    id: "model-a",
    type: "model.tflite" as const,
    modelVersionId: "version-a",
    modelName: "Hoja",
    version: "0.9.0",
    inputs: { image: contract.input },
    outputs: { result: contract.output },
  };
  const condition = {
    id: "condition",
    type: "condition" as const,
    sourceNodeId: "model-a",
    label: "roya",
    operator: "gte" as const,
    threshold: 0.5,
    branches: { true: "Verdadero" as const, false: "Falso" as const },
  };
  const draft = {
    nodes: [imageNode, existingModel, condition],
    connections: [
      { sourceNodeId: "image", sourcePort: "imagen", targetNodeId: "model-a", targetPort: "image" },
    ],
    layout: { image: { x: 0, y: 0 } },
  };
  const versions = [{ id: "version-1", version: "1.0.0", contract, modelName: "Clasificador" }];
  const input = {
    applicationId: "app-1",
    workflowId: "workflow-1",
    userId: "admin",
    draftRevision: 0,
    modelVersionId: "version-1",
    position: { x: 344, y: 0 },
  };

  it("saves the model and its connection together, keeping the port's other branches", async () => {
    const store = makeWorkflowPositionStoreDb(draft, versions);

    const result = await addModelNode(store.db, {
      ...input,
      source: { nodeId: "image", port: "imagen" },
    });

    if (!result.ok) throw new Error(`Expected the model to be added, got ${result.reason}`);
    const added = result.draft.nodes[3];
    if (!added) throw new Error("Expected the model node in the draft");
    expect(added).toEqual({
      id: expect.any(String),
      type: "model.tflite",
      modelVersionId: "version-1",
      modelName: "Clasificador",
      version: "1.0.0",
      inputs: { image: contract.input },
      outputs: { result: contract.output },
    });
    expect(result.draft.connections).toEqual([
      ...draft.connections,
      { sourceNodeId: "image", sourcePort: "imagen", targetNodeId: added.id, targetPort: "image" },
    ]);
    expect(result.draft.layout).toEqual({ ...draft.layout, [added.id]: input.position });
    expect(store.writes).toBe(1);
    expect(store.lockedTables).toContain(workflow);
    expect(store.reload()).toEqual(result.draft);
  });

  it.each([
    ["a missing node", "missing", "imagen"],
    ["a model result", "model-a", "result"],
    ["a condition branch", "condition", "true"],
    ["an unknown port of the image input", "image", "result"],
  ])(
    "rejects %s as its source without saving the node or the connection",
    async (_case, nodeId, port) => {
      const store = makeWorkflowPositionStoreDb(draft, versions);

      const result = await addModelNode(store.db, { ...input, source: { nodeId, port } });

      expect(result).toEqual({ ok: false, reason: "incompatibleSource" });
      expect(store.writes).toBe(0);
      expect(store.reload()).toEqual(draft);
    },
  );

  it("still reports a version without a contract before looking at the source", async () => {
    const store = makeWorkflowPositionStoreDb(draft, [{ ...versions[0], contract: null }]);

    const result = await addModelNode(store.db, {
      ...input,
      source: { nodeId: "image", port: "imagen" },
    });

    expect(result).toEqual({ ok: false, reason: "contractRequired" });
    expect(store.writes).toBe(0);
  });
});

describe("deleteWorkflowNode", () => {
  it("removes the selected node, incident connections, and saved layout", async () => {
    const draft = {
      nodes: [
        { id: "image", type: "input.image" as const, outputs: { imagen: "image" as const } },
        {
          id: "model",
          type: "model.tflite" as const,
          modelVersionId: "version-1",
          modelName: "Classifier",
          version: "1.0.0",
          inputs: {
            image: {
              type: "image" as const,
              width: 224,
              height: 224,
              channels: 3 as const,
              normalization: "none" as const,
            },
          },
          outputs: { result: { type: "classification" as const, labels: ["ok", "bad"] } },
        },
        {
          id: "condition-1",
          type: "condition" as const,
          sourceNodeId: "model",
          label: "bad",
          operator: "gte" as const,
          threshold: 0.5,
          branches: { true: "Verdadero" as const, false: "Falso" as const },
        },
        {
          id: "condition-2",
          type: "condition" as const,
          sourceNodeId: "condition-1",
          label: "follow-up",
          operator: "gt" as const,
          threshold: 0.2,
          branches: { true: "Verdadero" as const, false: "Falso" as const },
        },
        {
          id: "output-dependent",
          type: "output" as const,
          name: "Dependent",
          sourceNodeId: "condition-2",
          sourcePort: "true",
          resultType: "boolean" as const,
        },
        { id: "other", type: "input.image" as const, outputs: { imagen: "image" as const } },
        {
          id: "model-2",
          type: "model.tflite" as const,
          modelVersionId: "version-2",
          modelName: "Second classifier",
          version: "2.0.0",
          inputs: {
            image: {
              type: "image" as const,
              width: 224,
              height: 224,
              channels: 3 as const,
              normalization: "none" as const,
            },
          },
          outputs: { result: { type: "classification" as const, labels: ["healthy", "diseased"] } },
        },
        {
          id: "condition-independent",
          type: "condition" as const,
          sourceNodeId: "model-2",
          label: "diseased",
          operator: "gte" as const,
          threshold: 0.7,
          branches: { true: "Verdadero" as const, false: "Falso" as const },
        },
        {
          id: "output-independent",
          type: "output" as const,
          name: "Independent",
          sourceNodeId: "condition-independent",
          sourcePort: "true",
          resultType: "boolean" as const,
        },
      ],
      connections: [
        { sourceNodeId: "image", sourcePort: "imagen", targetNodeId: "model", targetPort: "image" },
        { sourceNodeId: "other", sourcePort: "imagen", targetNodeId: "model", targetPort: "image" },
        {
          sourceNodeId: "other",
          sourcePort: "imagen",
          targetNodeId: "model-2",
          targetPort: "image",
        },
        {
          sourceNodeId: "other",
          sourcePort: "imagen",
          targetNodeId: "condition-2",
          targetPort: "source",
        },
      ],
      layout: {
        model: { x: 80, y: 90 },
        "condition-1": { x: 100, y: 100 },
        "condition-2": { x: 120, y: 120 },
        "output-dependent": { x: 140, y: 140 },
        other: { x: 180, y: 190 },
        "model-2": { x: 220, y: 230 },
        "condition-independent": { x: 240, y: 250 },
        "output-independent": { x: 260, y: 270 },
      },
    };
    const store = makeWorkflowPositionStoreDb(draft);
    const result = await deleteWorkflowNode(store.db, {
      applicationId: "app-1",
      workflowId: "workflow-1",
      nodeId: "model",
      userId: "admin",
      draftRevision: 0,
    });

    expect(result).toMatchObject({ ok: true });
    expect(store.reload()).toEqual({
      nodes: [draft.nodes[0], draft.nodes[5], draft.nodes[6], draft.nodes[7], draft.nodes[8]],
      connections: [draft.connections[2]],
      layout: {
        other: { x: 180, y: 190 },
        "model-2": { x: 220, y: 230 },
        "condition-independent": { x: 240, y: 250 },
        "output-independent": { x: 260, y: 270 },
      },
    });
    const remainingNodeIds = new Set(store.reload().nodes.map((node) => node.id));
    const danglingDerivedEdges = store
      .reload()
      .nodes.flatMap((node) =>
        node.type === "condition" || node.type === "output"
          ? remainingNodeIds.has(node.sourceNodeId)
            ? []
            : [node.id]
          : [],
      );
    expect(danglingDerivedEdges).toEqual([]);
  });
});

describe("updateWorkflowNode", () => {
  const modelNode = {
    id: "model",
    type: "model.tflite" as const,
    modelVersionId: "version-1",
    modelName: "Classifier",
    version: "1.0.0",
    inputs: {
      image: {
        type: "image" as const,
        width: 224,
        height: 224,
        channels: 3 as const,
        normalization: "none" as const,
      },
    },
    outputs: { result: { type: "classification" as const, labels: ["roya", "sana"] } },
  };
  const conditionNode = {
    id: "condition",
    type: "condition" as const,
    sourceNodeId: "model",
    label: "roya",
    operator: "gte" as const,
    threshold: 0.5,
    branches: { true: "Verdadero" as const, false: "Falso" as const },
  };
  const outputNode = {
    id: "output",
    type: "output" as const,
    name: "Con roya",
    sourceNodeId: "condition",
    sourcePort: "true",
    resultType: "boolean" as const,
  };
  const editableDraft = {
    nodes: [
      { id: "image", type: "input.image" as const, outputs: { imagen: "image" as const } },
      modelNode,
      conditionNode,
      outputNode,
    ],
    connections: [
      { sourceNodeId: "image", sourcePort: "imagen", targetNodeId: "model", targetPort: "image" },
    ],
    layout: { model: { x: 320, y: 48 }, condition: { x: 640, y: 48 }, output: { x: 960, y: 48 } },
  };
  const nodeInput = {
    applicationId: "app-1",
    workflowId: "workflow-1",
    userId: "admin",
    draftRevision: 0,
  };

  it("saves a condition's new threshold, keeping its id, source, position, and connections", async () => {
    const store = makeWorkflowPositionStoreDb(editableDraft);
    const result = await updateWorkflowNode(store.db, {
      ...nodeInput,
      nodeId: "condition",
      changes: { type: "condition", label: "sana", operator: "lt", threshold: 0.75 },
    });

    const expectedDraft = {
      ...editableDraft,
      nodes: [
        editableDraft.nodes[0],
        modelNode,
        { ...conditionNode, label: "sana", operator: "lt", threshold: 0.75 },
        outputNode,
      ],
    };
    expect(result).toEqual({ ok: true, draft: expectedDraft, draftRevision: 1 });
    expect(store.reload()).toEqual(expectedDraft);
    expect(store.writes).toBe(1);
    expect(store.lockedTables).toContain(workflow);
  });

  it("renames an output without changing its source", async () => {
    const store = makeWorkflowPositionStoreDb(editableDraft);
    const result = await updateWorkflowNode(store.db, {
      ...nodeInput,
      nodeId: "output",
      changes: { type: "output", name: "Hoja enferma" },
    });

    expect(result).toMatchObject({ ok: true });
    expect(store.reload()).toEqual({
      ...editableDraft,
      nodes: [...editableDraft.nodes.slice(0, 3), { ...outputNode, name: "Hoja enferma" }],
    });
  });

  it("rejects a label the source model does not produce and keeps the previous condition", async () => {
    const store = makeWorkflowPositionStoreDb(editableDraft);
    const result = await updateWorkflowNode(store.db, {
      ...nodeInput,
      nodeId: "condition",
      changes: { type: "condition", label: "mancha", operator: "gte", threshold: 0.9 },
    });

    expect(result).toEqual({ ok: false, reason: "incompatibleSource" });
    expect(store.writes).toBe(0);
    expect(store.reload()).toEqual(editableDraft);
  });

  it.each([
    ["a missing node", "missing", { type: "output" as const, name: "Salida" }, "nodeNotFound"],
    [
      "a model node",
      "model",
      { type: "condition" as const, label: "roya", operator: "gte" as const, threshold: 0.5 },
      "notEditable",
    ],
    [
      "a node of another type",
      "condition",
      { type: "output" as const, name: "Salida" },
      "notEditable",
    ],
  ] as const)("rejects editing %s without writing", async (_case, nodeId, changes, reason) => {
    const store = makeWorkflowPositionStoreDb(editableDraft);
    const result = await updateWorkflowNode(store.db, { ...nodeInput, nodeId, changes });

    expect(result).toEqual({ ok: false, reason });
    expect(store.writes).toBe(0);
    expect(store.reload()).toEqual(editableDraft);
  });
});

describe("draft revisions (US-130)", () => {
  const contract = {
    input: {
      type: "image" as const,
      width: 224,
      height: 224,
      channels: 3 as const,
      normalization: "none" as const,
    },
    output: { type: "classification" as const, labels: ["roya", "sana"] },
  };
  const model = (id: string) => ({
    id,
    type: "model.tflite" as const,
    modelVersionId: "version-1",
    modelName: "Hoja",
    version: "1.0.0",
    inputs: { image: contract.input },
    outputs: { result: contract.output },
  });
  const condition = {
    id: "condition",
    type: "condition" as const,
    sourceNodeId: "model-a",
    label: "roya",
    operator: "gte" as const,
    threshold: 0.5,
    branches: { true: "Verdadero" as const, false: "Falso" as const },
  };
  const connection = {
    sourceNodeId: "image",
    sourcePort: "imagen",
    targetNodeId: "model-a",
    targetPort: "image",
  };
  // Every change below would be accepted on the current revision.
  const draft = {
    nodes: [model("model-a"), model("model-b"), condition],
    connections: [connection],
    layout: { "model-a": { x: 0, y: 0 } },
  };
  const draftWithImage = {
    ...draft,
    nodes: [
      { id: "image", type: "input.image" as const, outputs: { imagen: "image" as const } },
      ...draft.nodes,
    ],
  };
  const versions = [{ id: "version-1", version: "1.0.0", contract, modelName: "Hoja" }];
  const target = { applicationId: "app-1", workflowId: "workflow-1", userId: "admin" };
  const changes = [
    [
      "adding an image input",
      draft,
      (db: WorkflowDatabase, draftRevision: number) =>
        addImageInputNode(db, { ...target, draftRevision }),
    ],
    [
      "adding a model",
      draftWithImage,
      (db: WorkflowDatabase, draftRevision: number) =>
        addModelNode(db, { ...target, draftRevision, modelVersionId: "version-1" }),
    ],
    [
      "adding a condition",
      draftWithImage,
      (db: WorkflowDatabase, draftRevision: number) =>
        addConditionNode(db, {
          ...target,
          draftRevision,
          sourceNodeId: "model-b",
          label: "sana",
          operator: "lt",
          threshold: 0.3,
        }),
    ],
    [
      "adding an output",
      draftWithImage,
      (db: WorkflowDatabase, draftRevision: number) =>
        addOutputNode(db, {
          ...target,
          draftRevision,
          name: "Con roya",
          sourceNodeId: "condition",
          sourcePort: "true",
          resultType: "boolean",
        }),
    ],
    [
      "connecting two nodes",
      draftWithImage,
      (db: WorkflowDatabase, draftRevision: number) =>
        addWorkflowConnection(db, {
          ...target,
          ...connection,
          targetNodeId: "model-b",
          draftRevision,
        }),
    ],
    [
      "removing a connection",
      draftWithImage,
      (db: WorkflowDatabase, draftRevision: number) =>
        removeWorkflowConnection(db, { ...target, ...connection, draftRevision }),
    ],
    [
      "moving nodes",
      draftWithImage,
      (db: WorkflowDatabase, draftRevision: number) =>
        updateWorkflowNodePositions(db, {
          ...target,
          draftRevision,
          positions: { "model-a": { x: 16, y: 16 }, "model-b": { x: 320, y: 0 } },
        }),
    ],
    [
      "editing a node",
      draftWithImage,
      (db: WorkflowDatabase, draftRevision: number) =>
        updateWorkflowNode(db, {
          ...target,
          draftRevision,
          nodeId: "condition",
          changes: { type: "condition", label: "sana", operator: "lt", threshold: 0.2 },
        }),
    ],
    [
      "deleting a node",
      draftWithImage,
      (db: WorkflowDatabase, draftRevision: number) =>
        deleteWorkflowNode(db, { ...target, draftRevision, nodeId: "model-b" }),
    ],
  ] as const;

  it.each(changes)(
    "rejects %s based on an older revision without changing the draft",
    async (_change, stored, apply) => {
      const store = makeWorkflowPositionStoreDb(stored, versions, 3);

      const result = await apply(store.db, 2);

      expect(result).toEqual({ ok: false, reason: "draftConflict" });
      expect(store.writes).toBe(0);
      expect(store.reload()).toEqual(stored);
      expect(store.draftRevision).toBe(3);
      expect(store.lockedTables).toContain(workflow);
    },
  );

  it.each(changes)(
    "saves %s on the current revision as the next revision",
    async (_change, stored, apply) => {
      const store = makeWorkflowPositionStoreDb(stored, versions, 3);

      const result = await apply(store.db, 3);

      expect(result).toMatchObject({ ok: true, draftRevision: 4 });
      expect(store.writes).toBe(1);
      expect(store.draftRevision).toBe(4);
    },
  );

  it("rejects a connection made on the view from before someone else moved a node", async () => {
    const store = makeWorkflowPositionStoreDb(draftWithImage, versions, 3);
    // The first administrator moves a node on revision 3.
    const moved = await updateWorkflowNodePositions(store.db, {
      ...target,
      draftRevision: 3,
      positions: { "model-a": { x: 480, y: 96 } },
    });
    expect(moved).toEqual({
      ok: true,
      positions: { "model-a": { x: 480, y: 96 } },
      draftRevision: 4,
    });
    const afterMove = store.reload();

    // The second administrator still sees revision 3.
    const connected = await addWorkflowConnection(store.db, {
      ...target,
      ...connection,
      targetNodeId: "model-b",
      draftRevision: 3,
    });

    expect(connected).toEqual({ ok: false, reason: "draftConflict" });
    expect(store.reload()).toEqual(afterMove);
    expect(store.reload().layout).toEqual({ "model-a": { x: 480, y: 96 } });
    expect(store.draftRevision).toBe(4);
  });

  it("reports a missing workflow before comparing revisions", async () => {
    const store = makeWorkflowPositionStoreDb(draft, [], 3, false);

    const result = await deleteWorkflowNode(store.db, {
      ...target,
      draftRevision: 2,
      nodeId: "model-b",
    });

    expect(result).toEqual({ ok: false, reason: "workflowNotFound" });
    expect(store.writes).toBe(0);
  });
});

describe("draft revisions in the routes (US-130)", () => {
  const conflict = async () => ({ ok: false as const, reason: "draftConflict" as const });
  const connection = {
    sourceNodeId: "image",
    sourcePort: "imagen",
    targetNodeId: "model",
    targetPort: "image",
  };
  const routes = [
    {
      name: "POST …/nodes",
      path: "/nodes",
      method: "POST",
      body: { type: "input.image" },
      store: "addImageInput",
      app: () => makeApp({ addImageInput: conflict }),
    },
    {
      name: "POST …/connections",
      path: "/connections",
      method: "POST",
      body: connection,
      store: "addConnection",
      app: () => makeApp({ addConnection: conflict }),
    },
    {
      name: "DELETE …/connections",
      path: "/connections",
      method: "DELETE",
      body: connection,
      store: "removeConnection",
      app: () => makeApp({ removeConnection: conflict }),
    },
    {
      name: "PATCH …/layout",
      path: "/layout",
      method: "PATCH",
      body: { positions: { model: { x: 16, y: 32 } } },
      store: "updateNodePositions",
      app: () => makeApp({ updateNodePositions: conflict }),
    },
    {
      name: "PATCH …/nodes/:nodeId",
      path: "/nodes/output-1",
      method: "PATCH",
      body: { type: "output", name: "Salida" },
      store: "updateNode",
      app: () => makeApp({ updateNode: conflict }),
    },
    {
      name: "DELETE …/nodes/:nodeId",
      path: "/nodes/node-1",
      method: "DELETE",
      body: {},
      store: "deleteNode",
      app: () => makeApp({ deleteNode: conflict }),
    },
  ] as const;
  const send = (app: ReturnType<typeof makeApp>, route: (typeof routes)[number], body: unknown) =>
    app.request.request(`/applications/app-1/workflows/workflow-1${route.path}`, {
      method: route.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it.each(routes)(
    "$name answers 409 draftConflict when the draft changed since it was loaded",
    async (route) => {
      const app = route.app();

      const response = await send(app, route, { ...route.body, draftRevision: BASE_REVISION });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        message: "Otra persona modificó este borrador. Recarga para ver los cambios.",
        code: "draftConflict",
      });
      expect(app[route.store]).toHaveBeenCalledWith(
        expect.objectContaining({ draftRevision: BASE_REVISION }),
      );
    },
  );

  it.each(routes)("$name rejects a change that names no valid revision", async (route) => {
    for (const draftRevision of [undefined, -1, 1.5, "4"]) {
      const app = route.app();

      const response = await send(app, route, { ...route.body, draftRevision });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        message: "Recarga el borrador e inténtalo nuevamente.",
      });
      expect(app[route.store]).not.toHaveBeenCalled();
    }
  });

  it("answers the new revision with every saved change", async () => {
    const saved = { nodes: [] };
    const { request } = makeApp({
      addConnection: async () => ({ ok: true, draft: saved, draftRevision: NEXT_REVISION }),
    });

    const response = await request.request("/applications/app-1/workflows/workflow-1/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...connection, draftRevision: BASE_REVISION }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ draft: saved, draftRevision: NEXT_REVISION });
  });
});

function makeWorkflowPositionStoreDb(
  draft: import("./workflow-store").WorkflowDraft,
  // The model versions a model node lookup finds.
  modelVersions: Record<string, unknown>[] = [],
  // The stored draft revision (US-130).
  draftRevision = 0,
  // Whether the application has the workflow at all.
  workflowExists = true,
) {
  let storedDraft = structuredClone(draft);
  let storedRevision = draftRevision;
  let writes = 0;
  const lockedTables: unknown[] = [];
  const executor = {
    select: () => ({
      from: (table: unknown) => ({
        innerJoin: () => ({
          where: () => ({ limit: async () => structuredClone(modelVersions) }),
        }),
        where: () => ({
          limit: () => ({
            for: async () => {
              lockedTables.push(table);
              if (table === application)
                return [{ id: "app-1", organizationId: "org-1", name: "Cámara", status: "active" }];
              if (table === member) return [{ role: "admin" }];
              if (table === workflow)
                return workflowExists
                  ? [{ draft: structuredClone(storedDraft), draftRevision: storedRevision }]
                  : [];
              return [];
            },
          }),
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            expect(table).toBe(workflow);
            const query = toQuery(values.draft);
            const serializedDraft = query.params.find((value) => typeof value === "string");
            if (typeof serializedDraft !== "string")
              throw new Error("Updated draft was not serialized");
            storedDraft = JSON.parse(serializedDraft) as typeof storedDraft;
            if (typeof values.draftRevision !== "number")
              throw new Error("Updated draft has no revision");
            storedRevision = values.draftRevision;
            writes += 1;
            return [{ draft: structuredClone(storedDraft), draftRevision: storedRevision }];
          },
        }),
      }),
    }),
  };
  const db: WorkflowDatabase = {
    transaction: (callback) => callback(executor),
  };
  return {
    db,
    lockedTables,
    get writes() {
      return writes;
    },
    get draftRevision() {
      return storedRevision;
    },
    reload: () => structuredClone(storedDraft),
  };
}
