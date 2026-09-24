import { application, member, workflow, workflowVersion } from "@ayni/db/schema/index";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import type { Application } from "./applications";
import {
  type AddImageInputResult,
  addConditionNode,
  addImageInputNode,
  type CreateWorkflowResult,
  createWorkflow,
  findWorkflowCycle,
  getWorkflow,
  listWorkflows,
  type RenameWorkflowResult,
  renameWorkflow,
  type TransactionExecutor,
  updateWorkflowNodePosition,
  type Workflow,
  type WorkflowDatabase,
  type WorkflowDetail,
  type WorkflowNode,
} from "./workflow-store";
import type { WorkflowValidationResult } from "./workflow-validation";
import type {
  PublishWorkflowVersionInput,
  PublishWorkflowVersionResult,
} from "./workflow-version-store";
import { createWorkflowsApp } from "./workflows";

describe("findWorkflowCycle", () => {
  const candidate = {
    sourceNodeId: "b",
    sourcePort: "result",
    targetNodeId: "a",
    targetPort: "image",
  };

  it("detects direct and indirect cycles and leaves acyclic additions alone", () => {
    const edge = (sourceNodeId: string, targetNodeId: string) => ({
      sourceNodeId,
      sourcePort: "result",
      targetNodeId,
      targetPort: "image",
    });
    expect(findWorkflowCycle({ nodes: [], connections: [edge("a", "b")] }, candidate)).toEqual([
      "b",
      "a",
    ]);
    expect(
      findWorkflowCycle({ nodes: [], connections: [edge("a", "c"), edge("c", "b")] }, candidate),
    ).toEqual(["b", "a", "c"]);
    expect(findWorkflowCycle({ nodes: [], connections: [edge("a", "c")] }, candidate)).toBe(
      undefined,
    );
  });
});

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
  versions: [],
};

type CreateInput = { applicationId: string; userId: string; name: string };
type RenameInput = { applicationId: string; workflowId: string; userId: string; name: string };
type AddImageInputInput = { applicationId: string; workflowId: string; userId: string };

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
  addImageInput = async (): Promise<AddImageInputResult> => ({
    ok: true,
    draft: { nodes: [{ id: "node-1", type: "input.image", outputs: { imagen: "image" } }] },
  }),
  addConditionNode = async () => ({ ok: false as const, reason: "incompatibleSource" as const }),
  addModelNode = async () => ({ ok: false as const, reason: "modelVersionNotFound" as const }),
  addOutputNode = async () => ({ ok: false as const, reason: "incompatibleSource" as const }),
  updateNodePosition = async ({ x, y }: { x: number; y: number }) => ({
    ok: true as const,
    position: { x, y },
  }),
  publishVersion = async ({
    workflowId,
    version,
  }: PublishWorkflowVersionInput): Promise<PublishWorkflowVersionResult> => ({
    ok: true,
    version: { id: "version-1", workflowId, version, createdAt: "2026-09-24T12:00:00.000Z" },
  }),
}: {
  session?: { user: { id: string } } | null;
  application?: Application | null;
  membershipRole?: string | null;
  listedWorkflows?: Workflow[];
  workflowDetail?: WorkflowDetail | null;
  create?: (input: CreateInput) => Promise<CreateWorkflowResult>;
  rename?: (input: RenameInput) => Promise<RenameWorkflowResult>;
  addImageInput?: (input: AddImageInputInput) => Promise<AddImageInputResult>;
  addModelNode?: (input: {
    applicationId: string;
    workflowId: string;
    userId: string;
    modelVersionId: string;
    position?: { x: number; y: number };
  }) => Promise<import("./workflow-store").AddModelNodeResult>;
  addConditionNode?: (
    input: import("./workflow-store").AddConditionNodeInput,
  ) => Promise<import("./workflow-store").AddConditionNodeResult>;
  addOutputNode?: (
    input: import("./workflow-store").AddOutputNodeInput,
  ) => Promise<import("./workflow-store").AddOutputNodeResult>;
  updateNodePosition?: (
    input: import("./workflow-store").UpdateWorkflowNodePositionInput,
  ) => Promise<import("./workflow-store").UpdateWorkflowNodePositionResult>;
  publishVersion?: (input: PublishWorkflowVersionInput) => Promise<PublishWorkflowVersionResult>;
} = {}) {
  const createMock = vi.fn(create);
  const listMock = vi.fn(async (_applicationId: string) => listedWorkflows ?? [sampleWorkflow]);
  const getMock = vi.fn(
    async (_applicationId: string, _workflowId: string) => workflowDetail ?? undefined,
  );
  const renameMock = vi.fn(rename);
  const addImageInputMock = vi.fn(addImageInput);
  const addModelNodeMock = vi.fn(addModelNode);
  const addConditionNodeMock = vi.fn(addConditionNode);
  const addOutputNodeMock = vi.fn(addOutputNode);
  const addConnectionMock = vi.fn(async () => ({
    ok: false as const,
    reason: "incompatible" as const,
  }));
  const removeConnectionMock = vi.fn(async () => ({
    ok: false as const,
    reason: "connectionNotFound" as const,
  }));
  const updateNodePositionMock = vi.fn(updateNodePosition);
  const publishVersionMock = vi.fn(publishVersion);
  return {
    create: createMock,
    list: listMock,
    get: getMock,
    rename: renameMock,
    addImageInput: addImageInputMock,
    addModelNode: addModelNodeMock,
    addConditionNode: addConditionNodeMock,
    addOutputNode: addOutputNodeMock,
    addConnection: addConnectionMock,
    removeConnection: removeConnectionMock,
    updateNodePosition: updateNodePositionMock,
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
        addImageInput: addImageInputMock,
        addModelNode: addModelNodeMock,
        addConditionNode: addConditionNodeMock,
        addOutputNode: addOutputNodeMock,
        addConnection: addConnectionMock,
        removeConnection: removeConnectionMock,
        updateNodePosition: updateNodePositionMock,
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

function patchWorkflowNodePosition(
  request: ReturnType<typeof makeApp>["request"],
  body: unknown,
  nodeId = "node-1",
) {
  return request.request(`/applications/app-1/workflows/workflow-1/nodes/${nodeId}/position`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /applications/:applicationId/workflows/:workflowId/nodes/:nodeId/position", () => {
  it("persists a finite node position", async () => {
    const app = makeApp();
    const response = await patchWorkflowNodePosition(app.request, { x: 264, y: 512 });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ position: { x: 264, y: 512 } });
    expect(app.updateNodePosition).toHaveBeenCalledWith({
      applicationId: "app-1",
      workflowId: "workflow-1",
      nodeId: "node-1",
      userId: "admin",
      x: 264,
      y: 512,
    });
  });

  it.each([
    { x: -1, y: 0 },
    { x: 0, y: 100_001 },
    { x: Number.NaN, y: 2 },
  ])("rejects invalid coordinates without updating", async (position) => {
    const app = makeApp();
    const response = await patchWorkflowNodePosition(app.request, position);

    expect(response.status).toBe(400);
    expect(app.updateNodePosition).not.toHaveBeenCalled();
  });

  it("keeps node positions administrator-only", async () => {
    const app = makeApp({
      membershipRole: "member",
      updateNodePosition: async () => ({ ok: false, reason: "forbidden" }),
    });
    const response = await patchWorkflowNodePosition(app.request, { x: 10, y: 20 });

    expect(response.status).toBe(403);
    expect(app.updateNodePosition).toHaveBeenCalledTimes(1);
  });
});

function postWorkflowNode(request: ReturnType<typeof makeApp>["request"], body: unknown) {
  return request.request("/applications/app-1/workflows/workflow-1/nodes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /applications/:applicationId/workflows/:workflowId/nodes", () => {
  it("validates and dispatches a typed classification condition", async () => {
    const addConditionNode = vi.fn(async () => ({ ok: true as const, draft: { nodes: [] } }));
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
    const addModelNode = vi.fn(async () => ({ ok: true as const, draft: { nodes: [] } }));
    const { request } = makeApp({ addModelNode });

    const response = await postWorkflowNode(request, {
      type: "model.tflite",
      modelVersionId: "mv-1",
    });

    expect(response.status).toBe(200);
    expect(addModelNode).toHaveBeenCalledWith({
      applicationId: "app-1",
      workflowId: "workflow-1",
      userId: "admin",
      modelVersionId: "mv-1",
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
        }),
      )
      .mockResolvedValueOnce({
        ok: true,
        draft: { nodes: [{ id: "node-1", type: "input.image", outputs: { imagen: "image" } }] },
      })
      .mockResolvedValueOnce({ ok: false, reason: "duplicate" });
    const { request } = makeApp({ addImageInput });

    const created = await postWorkflowNode(request, { type: "input.image" });
    expect(created.status).toBe(200);
    await expect(created.json()).resolves.toEqual({
      draft: { nodes: [{ id: "node-1", type: "input.image", outputs: { imagen: "image" } }] },
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
      app.updateNodePosition,
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

function makeImageInputStoreDb(nodes: WorkflowNode[] = []) {
  const storedWorkflow = {
    id: "workflow-1",
    applicationId: "app-1",
    name: "DiagnÃ³stico",
    status: "draft",
    createdAt: new Date("2026-09-21T15:00:00.000Z"),
    updatedAt: new Date("2026-09-21T16:00:00.000Z"),
    draft: { nodes: structuredClone(nodes) },
  };
  const writes: unknown[] = [];
  const cloneWorkflow = () => structuredClone(storedWorkflow);

  const executor = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () => {
            const rows =
              table === application
                ? [{ id: "app-1", organizationId: "org-1", name: "CÃ¡mara", status: "active" }]
                : table === member
                  ? [{ role: "admin" }]
                  : table === workflow
                    ? [cloneWorkflow()]
                    : [];
            const result = Promise.resolve(rows);
            return table === workflow ? result : { for: async () => rows };
          },
          orderBy: async () => [],
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: unknown) => ({
          returning: async () => {
            expect(table).toBe(workflow);
            const whereQuery = toQuery(condition);
            expect(whereQuery.params).toEqual(["workflow-1", "app-1"]);

            const draftQuery = toQuery(values.draft);
            const serializedNode = draftQuery.params.find(
              (value): value is string =>
                typeof value === "string" &&
                (value.includes('"type":"input.image"') || value.includes('"type":"condition"')),
            );
            if (!serializedNode) throw new Error("Workflow node was not added to the SQL update");
            if (serializedNode.includes('"type":"input.image"')) {
              expect(whereQuery.sql).toContain("jsonb_path_exists");
              if (storedWorkflow.draft.nodes.some((node) => node.type === "input.image")) return [];
            }
            const node = JSON.parse(serializedNode) as (typeof storedWorkflow.draft.nodes)[number];
            storedWorkflow.draft.nodes.push(node);
            writes.push(values);
            return [cloneWorkflow()];
          },
        }),
      }),
    }),
  };

  const db: WorkflowDatabase = {
    transaction: (callback) => callback(executor),
  };
  return { db, writes, reload: () => cloneWorkflow().draft };
}

describe("addConditionNode source validation", () => {
  const input = {
    applicationId: "app-1",
    workflowId: "workflow-1",
    userId: "admin",
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
    const store = makeImageInputStoreDb(nodes);
    const originalDraft = store.reload();
    const result = await addConditionNode(store.db, { ...input, sourceNodeId });
    expect(result).toEqual({ ok: false, reason: "incompatibleSource" });
    expect(store.reload()).toEqual(originalDraft);
    expect(store.writes).toHaveLength(0);
  });

  it("persists and reloads a condition with its typed source and branches", async () => {
    const store = makeImageInputStoreDb([modelNode]);
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
    });
    const savedCondition = result.ok ? result.draft.nodes[1] : undefined;
    const reloadedCondition = store.reload().nodes[1];
    expect(reloadedCondition).toEqual(savedCondition);
    expect(store.writes).toHaveLength(1);
  });
});

describe("addImageInputNode", () => {
  it("persists one image input, rejects a duplicate, and reloads the unchanged draft", async () => {
    const store = makeImageInputStoreDb();
    const input = { applicationId: "app-1", workflowId: "workflow-1", userId: "admin" };

    const first = await addImageInputNode(store.db, input);
    expect(first).toEqual({
      ok: true,
      draft: {
        nodes: [{ id: expect.any(String), type: "input.image", outputs: { imagen: "image" } }],
      },
    });
    const savedDraft = (await getWorkflow(store.db, "app-1", "workflow-1"))?.draft;
    expect(savedDraft).toEqual(first.ok ? first.draft : undefined);

    const duplicate = await addImageInputNode(store.db, input);
    const reloadedDraft = (await getWorkflow(store.db, "app-1", "workflow-1"))?.draft;
    expect(duplicate).toEqual({ ok: false, reason: "duplicate" });
    expect(reloadedDraft).toEqual(savedDraft);
    expect(store.reload()).toEqual(savedDraft);
    expect(store.writes).toHaveLength(1);
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
      },
    ]);

    const detail = await getWorkflow(transaction.db, "app-1", "workflow-1");

    expect(detail).toEqual({
      workflow: sampleWorkflow,
      draft: { nodes: [] },
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

describe("updateWorkflowNodePosition", () => {
  it("persists layout metadata without changing nodes or connections", async () => {
    const draft = {
      nodes: [
        { id: "node-1", type: "input.image" as const, outputs: { imagen: "image" as const } },
      ],
      connections: [
        {
          sourceNodeId: "node-1",
          sourcePort: "imagen",
          targetNodeId: "node-2",
          targetPort: "image",
        },
      ],
      layout: { "node-2": { x: 320, y: 48 } },
    };
    const store = makeWorkflowPositionStoreDb(draft);
    const result = await updateWorkflowNodePosition(store.db, {
      applicationId: "app-1",
      workflowId: "workflow-1",
      nodeId: "node-1",
      userId: "admin",
      x: 128,
      y: 256,
    });

    expect(result).toEqual({ ok: true, position: { x: 128, y: 256 } });
    expect(store.reload()).toEqual({
      ...draft,
      layout: { "node-1": { x: 128, y: 256 }, "node-2": { x: 320, y: 48 } },
    });
    expect(store.lockedTables).toContain(workflow);
  });

  it("does not write a position for a missing node", async () => {
    const store = makeWorkflowPositionStoreDb({ nodes: [] });
    const result = await updateWorkflowNodePosition(store.db, {
      applicationId: "app-1",
      workflowId: "workflow-1",
      nodeId: "missing-node",
      userId: "admin",
      x: 128,
      y: 256,
    });

    expect(result).toEqual({ ok: false, reason: "nodeNotFound" });
    expect(store.writes).toBe(0);
  });
});

function makeWorkflowPositionStoreDb(draft: import("./workflow-store").WorkflowDraft) {
  let storedDraft = structuredClone(draft);
  let writes = 0;
  const lockedTables: unknown[] = [];
  const executor = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () => ({
            for: async () => {
              lockedTables.push(table);
              if (table === application)
                return [{ id: "app-1", organizationId: "org-1", name: "Cámara", status: "active" }];
              if (table === member) return [{ role: "admin" }];
              if (table === workflow) return [{ draft: structuredClone(storedDraft) }];
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
            writes += 1;
            return [{ draft: structuredClone(storedDraft) }];
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
    reload: () => structuredClone(storedDraft),
  };
}
