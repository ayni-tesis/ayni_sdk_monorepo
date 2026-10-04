import { z } from "zod";

import { COLLECTION_IMAGE_QUALITY, COLLECTION_MAX_IMAGE_SIZE } from "./collection-policy";

/**
 * The evidence the SDK uploads (US-070): the `evidence.json` it saved on the
 * device (US-066, US-067) plus the size and SHA-256 of its `image`, so the
 * server can check the bytes it receives.
 */

/** The only image type the SDK stores and uploads: the JPEG it optimized. */
export const EVIDENCE_IMAGE_MEDIA_TYPE = "image/jpeg";

/** The largest evidence image the server accepts, in bytes. */
export const EVIDENCE_IMAGE_MAX_BYTES = 32 * 1024 * 1024;

/** The largest `POST /sdk/evidence` body, in bytes: the metadata, never the image. */
export const SDK_EVIDENCE_MAX_BYTES = 1024 * 1024;

/** How long the signed URL for uploading an evidence image stays valid. */
export const EVIDENCE_UPLOAD_URL_TTL_SECONDS = 15 * 60;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().min(1).max(128);
const finite = z.number().finite();

const evidenceResultSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("classification"),
    nodeId: identifier,
    label: z.string(),
    confidence: finite,
    confidences: z.record(z.string(), finite),
  }),
  z.strictObject({
    type: z.literal("detection"),
    nodeId: identifier,
    detections: z.array(
      z.strictObject({
        label: z.string(),
        confidence: finite,
        box: z.strictObject({ xMin: finite, yMin: finite, xMax: finite, yMax: finite }),
      }),
    ),
  }),
]);

const evidenceImageSchema = z
  .strictObject({
    mediaType: z
      .literal(EVIDENCE_IMAGE_MEDIA_TYPE)
      .describe("Tipo de la imagen: siempre el JPEG que optimizó el SDK."),
    width: z.number().int().min(1).max(COLLECTION_MAX_IMAGE_SIZE.max).describe("Ancho en píxeles."),
    height: z.number().int().min(1).max(COLLECTION_MAX_IMAGE_SIZE.max).describe("Alto en píxeles."),
    maxImageSize: z
      .number()
      .int()
      .min(COLLECTION_MAX_IMAGE_SIZE.min)
      .max(COLLECTION_MAX_IMAGE_SIZE.max)
      .describe("Tamaño máximo (lado mayor) de la política con que se optimizó."),
    imageQuality: z
      .number()
      .int()
      .min(COLLECTION_IMAGE_QUALITY.min)
      .max(COLLECTION_IMAGE_QUALITY.max)
      .describe("Calidad JPEG de la política con que se optimizó."),
    byteSize: z
      .number()
      .int()
      .min(1)
      .describe(
        `Tamaño del archivo en bytes; el servidor acepta hasta ${EVIDENCE_IMAGE_MAX_BYTES / 1024 / 1024} MiB.`,
      ),
    sha256: sha256.describe("SHA-256 del archivo, en hexadecimal; el servidor lo comprueba."),
  })
  .refine(
    (image) => image.width <= image.maxImageSize && image.height <= image.maxImageSize,
    "The image is larger than the maximum size it was optimized for",
  );

/** The body of `POST /sdk/evidence`: one evidence of the SDK's local queue. */
export const sdkEvidenceSchema = z.strictObject({
  evidenceSchemaVersion: z.literal(1),
  evidenceId: z.uuid().describe("ID aleatorio que el SDK generó; reintentar lo reutiliza."),
  capturedAt: z.iso.datetime({ offset: true }).describe("Inicio de la ejecución que la capturó."),
  workflowId: identifier,
  workflowVersionId: identifier.describe("Versión publicada que ejecutó el SDK."),
  workflowVersion: identifier,
  captureNodeId: identifier.describe("Nodo `dataset.capture` que pidió la evidencia."),
  model: z.strictObject({
    modelVersionId: identifier,
    version: identifier,
    sha256,
  }),
  result: evidenceResultSchema.describe("Resultado de inferencia que recibió el nodo."),
  image: evidenceImageSchema,
});

export type SdkEvidence = z.infer<typeof sdkEvidenceSchema>;

/** The server holds the evidence: its metadata and its image. */
export const sdkEvidenceReceiptSchema = z.strictObject({
  evidenceId: z.uuid(),
  status: z.literal("received"),
  receivedAt: z.iso.datetime(),
});

/** The server saved the metadata and waits for the image at `uploadUrl`. */
export const sdkEvidenceUploadSchema = z.strictObject({
  evidenceId: z.uuid(),
  status: z.literal("uploadRequired"),
  uploadUrl: z
    .string()
    .describe(
      "URL firmada para subir la imagen con `PUT`, `Content-Type: image/jpeg` y sin la credencial; la firma incluye `Content-Length`, así que solo acepta exactamente `image.byteSize` bytes.",
    ),
  uploadUrlExpiresAt: z.iso.datetime().describe("Vencimiento de `uploadUrl` (ISO 8601)."),
});

/** The answer of `POST /sdk/evidence`. */
export const sdkEvidenceStartSchema = z.discriminatedUnion("status", [
  sdkEvidenceUploadSchema,
  sdkEvidenceReceiptSchema,
]);
