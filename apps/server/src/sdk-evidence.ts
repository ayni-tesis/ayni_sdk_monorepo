import {
  EVIDENCE_IMAGE_MAX_BYTES,
  SDK_EVIDENCE_MAX_BYTES,
  type SdkEvidence,
  sdkEvidenceSchema,
} from "@ayni/api/sdk-evidence";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { CollectionPolicy } from "./collection-policy-store";
import { INVALID_CREDENTIAL_MESSAGE, type VerifySdkCredentialResult } from "./sdk-credential-store";

export type StartSdkEvidenceResult =
  | { ok: true; status: "received"; receivedAt: string }
  | { ok: true; status: "uploadRequired"; uploadUrl: string; uploadUrlExpiresAt: string }
  | { ok: false; reason: "sourceNotFound" | "conflict" };

export type CompleteSdkEvidenceResult =
  | { ok: true; receivedAt: string }
  | { ok: false; reason: "notFound" | "imageMissing" | "invalidImage" };

type Dependencies = {
  credentials: { verify: (secret: string) => Promise<VerifySdkCredentialResult> };
  policies: { get: (applicationId: string) => Promise<CollectionPolicy> };
  evidence: {
    start: (applicationId: string, evidence: SdkEvidence) => Promise<StartSdkEvidenceResult>;
    complete: (applicationId: string, evidenceId: string) => Promise<CompleteSdkEvidenceResult>;
  };
};

export const EVIDENCE_COLLECTION_DISABLED_MESSAGE =
  "La recolección de evidencia de esta aplicación está deshabilitada.";
const INVALID_EVIDENCE = {
  message: "La evidencia no tiene un formato válido.",
  code: "invalidEvidence",
} as const;
const EVIDENCE_TOO_LARGE = {
  message: "La evidencia supera el tamaño máximo permitido.",
  code: "evidenceTooLarge",
} as const;
const EVIDENCE_NOT_FOUND = {
  message: "No encontramos esta evidencia.",
  code: "evidenceNotFound",
} as const;

/**
 * Creates the SDK endpoints that receive evidence for datasets (US-070). The
 * evidence belongs to the application of the credential: the server checks
 * that its workflow version, capture node and model version are of that
 * application. `POST /sdk/evidence` saves the metadata and answers a signed
 * URL for uploading the image straight to storage, because an image can be
 * larger than a function's request body; `…/complete` checks that image and
 * confirms the receipt. Both recheck the collection policy.
 */
export function createSdkEvidenceApp({ credentials, policies, evidence }: Dependencies) {
  const app = new Hono();

  /** The application of a valid credential whose policy collects evidence, or the error. */
  async function authorize(c: Context) {
    const bearer = /^bearer +([^\s]+)$/i.exec(c.req.header("Authorization") ?? "");
    const secret = bearer?.[1];
    if (!secret || !/^ayni_sk_[A-Za-z0-9_-]+$/.test(secret)) {
      return {
        error: c.json({ message: INVALID_CREDENTIAL_MESSAGE, code: "invalidCredential" }, 401),
      };
    }
    const verified = await credentials.verify(secret);
    if (verified.ok === false) {
      return { error: c.json({ message: verified.message, code: verified.code }, 401) };
    }
    const policy = await policies.get(verified.credential.applicationId);
    if (!policy.enabled) {
      return {
        error: c.json(
          { message: EVIDENCE_COLLECTION_DISABLED_MESSAGE, code: "collectionDisabled" },
          403,
        ),
      };
    }
    return { applicationId: verified.credential.applicationId };
  }

  app.post(
    "/sdk/evidence",
    bodyLimit({
      maxSize: SDK_EVIDENCE_MAX_BYTES,
      onError: (c) => c.json(EVIDENCE_TOO_LARGE, 413),
    }),
    async (c) => {
      const authorized = await authorize(c);
      if ("error" in authorized) return authorized.error;

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json(INVALID_EVIDENCE, 400);
      }
      const parsed = sdkEvidenceSchema.safeParse(body);
      if (!parsed.success) return c.json(INVALID_EVIDENCE, 400);
      if (parsed.data.image.byteSize > EVIDENCE_IMAGE_MAX_BYTES) {
        return c.json(EVIDENCE_TOO_LARGE, 413);
      }

      const result = await evidence.start(authorized.applicationId, parsed.data);
      if (result.ok === false) {
        return result.reason === "conflict"
          ? c.json(
              {
                message: "El ID de evidencia ya se usó con otros datos.",
                code: "evidenceConflict",
              },
              409,
            )
          : c.json(
              {
                message: "La evidencia no corresponde a un workflow publicado de esta aplicación.",
                code: "evidenceSourceNotFound",
              },
              404,
            );
      }
      const { evidenceId } = parsed.data;
      return result.status === "received"
        ? c.json({ evidenceId, status: "received", receivedAt: result.receivedAt })
        : c.json({
            evidenceId,
            status: "uploadRequired",
            uploadUrl: result.uploadUrl,
            uploadUrlExpiresAt: result.uploadUrlExpiresAt,
          });
    },
  );

  app.post("/sdk/evidence/:evidenceId/complete", async (c) => {
    const authorized = await authorize(c);
    if ("error" in authorized) return authorized.error;

    const evidenceId = c.req.param("evidenceId");
    if (!z.uuid().safeParse(evidenceId).success) return c.json(EVIDENCE_NOT_FOUND, 404);

    const result = await evidence.complete(authorized.applicationId, evidenceId);
    if (result.ok) {
      return c.json({ evidenceId, status: "received", receivedAt: result.receivedAt });
    }
    switch (result.reason) {
      case "notFound":
        return c.json(EVIDENCE_NOT_FOUND, 404);
      case "imageMissing":
        return c.json(
          {
            message: "La imagen de la evidencia todavía no se subió.",
            code: "evidenceImageMissing",
          },
          409,
        );
      case "invalidImage":
        return c.json(
          { message: "La imagen no coincide con la evidencia.", code: "invalidEvidenceImage" },
          400,
        );
    }
  });

  return app;
}
