import { createHash } from "node:crypto";
import { EVIDENCE_UPLOAD_URL_TTL_SECONDS, type SdkEvidence } from "@ayni/api/sdk-evidence";
import { describe, expect, it } from "vitest";
import {
  createSdkEvidenceService,
  type EvidenceStorage,
  type SdkEvidenceRepository,
  type SdkEvidenceRow,
} from "./sdk-evidence-store";

const EVIDENCE_ID = "6f1d2c3b-4a59-4e8d-9c7b-0a1b2c3d4e5f";
const NOW = new Date("2026-10-03T12:01:00.000Z");

/** A JPEG reduced to SOI, a 640×480 frame header and SOS. */
const image = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0xff, 0xda, 0x00, 0x02,
]);
const imageSha256 = createHash("sha256").update(image).digest("hex");

const evidence: SdkEvidence = {
  evidenceSchemaVersion: 1,
  evidenceId: EVIDENCE_ID,
  capturedAt: "2026-10-03T12:00:00.000Z",
  workflowId: "workflow-1",
  workflowVersionId: "workflow-version-1",
  workflowVersion: "1.0.0",
  captureNodeId: "captura",
  model: { modelVersionId: "model-version-1", version: "2.0.0", sha256: "a".repeat(64) },
  result: {
    type: "classification",
    nodeId: "modelo",
    label: "sana",
    confidence: 0.9,
    confidences: { sana: 0.9, enferma: 0.1 },
  },
  image: {
    mediaType: "image/jpeg",
    width: 640,
    height: 480,
    maxImageSize: 1024,
    imageQuality: 80,
    byteSize: image.length,
    sha256: imageSha256,
  },
};

const definition = {
  schemaVersion: "3",
  nodes: [
    { id: "imagen", type: "input.image", outputs: { imagen: "image" } },
    { id: "modelo", type: "model.tflite", modelVersionId: "model-version-1" },
    { id: "otro", type: "model.tflite", modelVersionId: "model-version-2" },
    { id: "captura", type: "dataset.capture", inputs: { imagen: "image", resultado: "x" } },
  ],
  connections: [
    { sourceNodeId: "imagen", sourcePort: "imagen", targetNodeId: "modelo", targetPort: "image" },
    { sourceNodeId: "imagen", sourcePort: "imagen", targetNodeId: "captura", targetPort: "imagen" },
    {
      sourceNodeId: "modelo",
      sourcePort: "result",
      targetNodeId: "captura",
      targetPort: "resultado",
    },
  ],
};

function memory({
  workflowVersions = {
    "app-1/workflow-version-1": { workflowId: "workflow-1", version: "1.0.0", definition },
  } as Record<string, { workflowId: string; version: string; definition: unknown }>,
  modelVersions = {
    "app-1/model-version-1": {
      modelId: "model-1",
      version: "2.0.0",
      sha256: "a".repeat(64),
      contract: { output: { type: "classification", labels: ["sana", "enferma"] } },
    },
    "app-1/model-version-2": {
      modelId: "model-2",
      version: "1.0.0",
      sha256: "c".repeat(64),
      contract: { output: { type: "classification", labels: ["sana", "enferma"] } },
    },
  } as Record<
    string,
    { modelId: string; version: string; sha256: string; contract: unknown | null }
  >,
} = {}) {
  const rows = new Map<string, SdkEvidenceRow>();
  const objects = new Map<string, Uint8Array>();
  const uploadUrls: string[] = [];
  const repository: SdkEvidenceRepository = {
    findWorkflowVersion: async (applicationId, id) =>
      workflowVersions[`${applicationId}/${id}`] ?? null,
    findModelVersion: async (applicationId, id) => modelVersions[`${applicationId}/${id}`] ?? null,
    insert: async (row) => {
      const key = `${row.applicationId}/${row.evidenceId}`;
      if (rows.has(key)) return false;
      rows.set(key, row);
      return true;
    },
    find: async (applicationId, evidenceId) => rows.get(`${applicationId}/${evidenceId}`) ?? null,
    markReceived: async (applicationId, evidenceId, receivedAt) => {
      const row = rows.get(`${applicationId}/${evidenceId}`);
      if (!row || row.status === "received") return null;
      rows.set(`${applicationId}/${evidenceId}`, { ...row, status: "received", receivedAt });
      return receivedAt;
    },
  };
  const storage: EvidenceStorage = {
    createUploadUrl: async (key, expiresIn, byteSize) => {
      const url = `https://storage.example/${key}?expires=${expiresIn}&bytes=${byteSize}`;
      uploadUrls.push(url);
      return url;
    },
    getSize: async (key) => objects.get(key)?.length ?? null,
    read: async (key) => {
      const bytes = objects.get(key);
      if (!bytes) throw new Error(`No object ${key}`);
      return bytes;
    },
    write: async (key, bytes) => {
      objects.set(key, bytes);
    },
    remove: async (key) => {
      objects.delete(key);
    },
  };
  return {
    service: createSdkEvidenceService({ repository, storage, now: () => NOW }),
    storage,
    rows,
    objects,
    uploadUrls,
  };
}

const stagingKey = `staging/app-1/evidence/${EVIDENCE_ID}.jpg`;
const storageKey = `applications/app-1/evidence/${EVIDENCE_ID}.jpg`;

describe("starting an evidence upload (US-070)", () => {
  it("saves the evidence for the workflow, version and model it names and signs an upload URL", async () => {
    const { service, rows } = memory();

    const result = await service.start("app-1", evidence);

    expect(result).toEqual({
      ok: true,
      status: "uploadRequired",
      uploadUrl: `https://storage.example/${stagingKey}?expires=${EVIDENCE_UPLOAD_URL_TTL_SECONDS}&bytes=${image.length}`,
      uploadUrlExpiresAt: new Date(
        NOW.getTime() + EVIDENCE_UPLOAD_URL_TTL_SECONDS * 1000,
      ).toISOString(),
    });
    expect(rows.get(`app-1/${EVIDENCE_ID}`)).toMatchObject({
      applicationId: "app-1",
      evidenceId: EVIDENCE_ID,
      workflowId: "workflow-1",
      workflowVersionId: "workflow-version-1",
      captureNodeId: "captura",
      modelId: "model-1",
      modelVersionId: "model-version-1",
      modelVersion: "2.0.0",
      taskType: "classification",
      imageWidth: 640,
      imageHeight: 480,
      imageByteSize: image.length,
      imageSha256,
      storageKey,
      status: "awaitingUpload",
      receivedAt: null,
    });
  });

  it("signs a new URL when the same evidence is retried before its image arrived", async () => {
    const { service, rows, uploadUrls } = memory();
    await service.start("app-1", evidence);

    const retried = await service.start("app-1", {
      ...evidence,
      result: { ...evidence.result, confidences: { enferma: 0.1, sana: 0.9 } } as never,
    });

    expect(retried).toMatchObject({ ok: true, status: "uploadRequired" });
    expect(rows.size).toBe(1);
    expect(uploadUrls).toHaveLength(2);
  });

  it("rejects the same ID with other data", async () => {
    const { service } = memory();
    await service.start("app-1", evidence);

    const changed = await service.start("app-1", {
      ...evidence,
      capturedAt: "2026-10-04T00:00:00Z",
    });

    expect(changed).toEqual({ ok: false, reason: "conflict" });
  });

  it.each([
    ["a workflow version of another application", { workflowVersionId: "workflow-version-9" }],
    ["another workflow", { workflowId: "workflow-2" }],
    ["another version number", { workflowVersion: "1.1.0" }],
    ["a node that is not a capture", { captureNodeId: "modelo" }],
    [
      "a model that does not feed the capture",
      { model: { modelVersionId: "model-version-2", version: "1.0.0", sha256: "c".repeat(64) } },
    ],
    ["another model version number", { model: { ...evidence.model, version: "2.0.1" } }],
    ["another model hash", { model: { ...evidence.model, sha256: "d".repeat(64) } }],
    [
      "a result of another task type",
      { result: { type: "detection", nodeId: "modelo", detections: [] } },
    ],
    ["a label the model does not have", { result: { ...evidence.result, label: "gato" } }],
    ["a result of another node", { result: { ...evidence.result, nodeId: "otro" } }],
  ] as const)("rejects evidence of %s and saves nothing", async (_, change) => {
    const { service, rows } = memory();

    const result = await service.start("app-1", { ...evidence, ...change } as SdkEvidence);

    expect(result).toEqual({ ok: false, reason: "sourceNotFound" });
    expect(rows.size).toBe(0);
  });

  it("rejects evidence whose workflow version belongs to another application", async () => {
    const { service, rows } = memory();

    const result = await service.start("app-2", evidence);

    expect(result).toEqual({ ok: false, reason: "sourceNotFound" });
    expect(rows.size).toBe(0);
  });

  it("rejects a model version of another application", async () => {
    const { service } = memory({
      modelVersions: {},
    });

    expect(await service.start("app-1", evidence)).toEqual({
      ok: false,
      reason: "sourceNotFound",
    });
  });
});

describe("completing an evidence upload (US-070)", () => {
  it("checks the uploaded image, keeps it and confirms the evidence", async () => {
    const { service, rows, objects } = memory();
    await service.start("app-1", evidence);
    objects.set(stagingKey, image);

    const result = await service.complete("app-1", EVIDENCE_ID);

    expect(result).toEqual({ ok: true, receivedAt: NOW.toISOString() });
    expect(objects.get(storageKey)).toEqual(image);
    expect(objects.has(stagingKey)).toBe(false);
    expect(rows.get(`app-1/${EVIDENCE_ID}`)).toMatchObject({ status: "received", receivedAt: NOW });
  });

  it("confirms a received evidence again without touching storage", async () => {
    const { service, objects } = memory();
    await service.start("app-1", evidence);
    objects.set(stagingKey, image);
    await service.complete("app-1", EVIDENCE_ID);
    objects.clear();

    expect(await service.complete("app-1", EVIDENCE_ID)).toEqual({
      ok: true,
      receivedAt: NOW.toISOString(),
    });
    expect(objects.size).toBe(0);
  });

  it("answers received when the SDK retries an evidence the server already confirmed", async () => {
    const { service, objects } = memory();
    await service.start("app-1", evidence);
    objects.set(stagingKey, image);
    await service.complete("app-1", EVIDENCE_ID);

    expect(await service.start("app-1", evidence)).toEqual({
      ok: true,
      status: "received",
      receivedAt: NOW.toISOString(),
    });
  });

  it("does not find the evidence of another application", async () => {
    const { service, objects } = memory();
    await service.start("app-1", evidence);
    objects.set(stagingKey, image);

    expect(await service.complete("app-2", EVIDENCE_ID)).toEqual({
      ok: false,
      reason: "notFound",
    });
  });

  it("waits for the image when it was not uploaded", async () => {
    const { service, rows } = memory();
    await service.start("app-1", evidence);

    expect(await service.complete("app-1", EVIDENCE_ID)).toEqual({
      ok: false,
      reason: "imageMissing",
    });
    expect(rows.get(`app-1/${EVIDENCE_ID}`)?.status).toBe("awaitingUpload");
  });

  it("still rejects the image when discarding it fails", async () => {
    const { service, objects, storage } = memory();
    await service.start("app-1", evidence);
    objects.set(stagingKey, new Uint8Array(image.length));
    storage.remove = async () => {
      throw new Error("R2 unavailable");
    };

    expect(await service.complete("app-1", EVIDENCE_ID)).toEqual({
      ok: false,
      reason: "invalidImage",
    });
  });

  it.each([
    ["of another size", new Uint8Array([...image, 0])],
    ["with other bytes", image.map((byte, index) => (index === image.length - 1 ? 0 : byte))],
    ["that is not a JPEG", new Uint8Array(image.length)],
  ])("rejects an image %s, discards it and confirms nothing", async (_, uploaded) => {
    const { service, rows, objects } = memory();
    await service.start("app-1", evidence);
    objects.set(stagingKey, uploaded);

    expect(await service.complete("app-1", EVIDENCE_ID)).toEqual({
      ok: false,
      reason: "invalidImage",
    });
    expect(objects.size).toBe(0);
    expect(rows.get(`app-1/${EVIDENCE_ID}`)?.status).toBe("awaitingUpload");
  });

  it("rejects a JPEG whose dimensions differ from the evidence", async () => {
    const other = { ...evidence, image: { ...evidence.image, width: 320 } };
    const { service, objects } = memory();
    await service.start("app-1", other);
    objects.set(stagingKey, image);

    expect(await service.complete("app-1", EVIDENCE_ID)).toEqual({
      ok: false,
      reason: "invalidImage",
    });
  });
});
