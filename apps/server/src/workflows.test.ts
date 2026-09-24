import { application, member, workflow } from "@ayni/db/schema/index";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import type { Application } from "./applications";
import {
  type AddImageInputResult,
  addImageInputNode,
  type CreateWorkflowResult,
  createWorkflow,
  getWorkflow,
  listWorkflows,
  type RenameWorkflowResult,
  renameWorkflow,
  type TransactionExecutor,
  type Workflow,
  type WorkflowDatabase,
  type WorkflowDetail,
} from "./workflow-store";
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
  }) => Promise<import("./workflow-store").AddModelNodeResult>;
  addConditionNode?: (
    input: import("./workflow-store").AddConditionNodeInput,
  ) => Promise<import("./workflow-store").AddConditionNodeResult>;
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
  return {
    create: createMock,
    list: listMock,
    get: getMock,
    rename: renameMock,
    addImageInput: addImageInputMock,
    addModelNode: addModelNodeMock,
    addConditionNode: addConditionNodeMock,
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

function makeImageInputStoreDb() {
  const storedWorkflow = {
    id: "workflow-1",
    applicationId: "app-1",
    name: "DiagnÃ³stico",
    status: "draft",
    createdAt: new Date("2026-09-21T15:00:00.000Z"),
    updatedAt: new Date("2026-09-21T16:00:00.000Z"),
    draft: { nodes: [] as { id: string; type: "input.image"; outputs: { imagen: "image" } }[] },
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
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: unknown) => ({
          returning: async () => {
            expect(table).toBe(workflow);
            const whereQuery = toQuery(condition);
            expect(whereQuery.sql).toContain("jsonb_path_exists");
            expect(whereQuery.params).toEqual(["workflow-1", "app-1"]);

            if (storedWorkflow.draft.nodes.some((node) => node.type === "input.image")) return [];

            const draftQuery = toQuery(values.draft);
            const serializedNode = draftQuery.params.find(
              (value): value is string =>
                typeof value === "string" && value.includes('"type":"input.image"'),
            );
            if (!serializedNode)
              throw new Error("Image input node was not added to the SQL update");
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
      },
      {
        id: "workflow-2",
        applicationId: "app-1",
        name: "Detección de roya",
        status: "draft",
        createdAt: "2026-09-21T15:30:00.000Z",
        updatedAt: "2026-09-21T15:30:00.000Z",
      },
    ]);
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

function makeGetDb(rows: Record<string, unknown>[]) {
  const filters: unknown[] = [];
  const limits: number[] = [];

  const executor = {
    select: (_fields: Record<string, unknown>) => ({
      from: (_table: unknown) => ({
        where: (condition: unknown) => {
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
  });
});
