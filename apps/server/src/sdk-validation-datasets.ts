import { SdkValidationDatasetManifestSchema } from "@ayni/api";
import { Hono } from "hono";

import {
  INVALID_CREDENTIAL_MESSAGE,
  type VerifySdkCredentialResult,
} from "./sdk-credential-store";
import type { ValidationDatasetStorage, ValidationDatasetStoreResult } from "./validation-dataset-store";

const DATASET_VERSION_NOT_FOUND_MESSAGE = "El dataset de validación ya no está disponible.";
const DATASET_MANIFEST_UNAVAILABLE_MESSAGE = "No se pudo preparar la descarga del dataset.";
const DOWNLOAD_URL_TTL_SECONDS = 900;

type DatasetManifestData = {
  datasetVersionId: string;
  datasetId: string;
  applicationId: string;
  version: string;
  partition: string;
  source: string;
  license: string;
  sha256: string;
  sizeBytes: number;
  storageKey: string;
};

type Dependencies = {
  credentials: {
    verify: (secret: string) => Promise<VerifySdkCredentialResult>;
  };
  datasets: {
    getManifestData: (
      applicationId: string,
      datasetVersionId: string,
    ) => Promise<ValidationDatasetStoreResult<DatasetManifestData>>;
  };
  storage: Pick<ValidationDatasetStorage, "createDownloadUrl">;
  now?: () => Date;
};

function sdkCredential(authorization: string): string | undefined {
  const bearer = /^bearer +(\S+)$/i.exec(authorization);
  const candidate = bearer?.[1];
  return candidate && /^ayni_sk_[A-Za-z0-9_-]+$/.test(candidate) ? candidate : undefined;
}

export function createSdkValidationDatasetsApp({
  credentials,
  datasets,
  storage,
  now = () => new Date(),
}: Dependencies) {
  const app = new Hono();

  app.get("/sdk/dataset-versions/:datasetVersionId/manifest", async (c) => {
    const secret = sdkCredential(c.req.header("Authorization") ?? "");
    if (!secret) {
      return c.json({ message: INVALID_CREDENTIAL_MESSAGE, code: "invalidCredential" }, 401);
    }

    let verified: VerifySdkCredentialResult;
    try {
      verified = await credentials.verify(secret);
    } catch {
      return c.json(
        {
          message: DATASET_MANIFEST_UNAVAILABLE_MESSAGE,
          code: "datasetManifestUnavailable",
        },
        500,
      );
    }
    if (verified.ok === false) {
        if (verified.code === "applicationArchived") {
          return c.json(
            {
              message: DATASET_VERSION_NOT_FOUND_MESSAGE,
              code: "datasetVersionNotFound",
            },
            404,
          );
        }
      return c.json({ message: verified.message, code: verified.code }, 401);
    }

    let result: ValidationDatasetStoreResult<DatasetManifestData>;
    try {
      result = await datasets.getManifestData(
        verified.credential.applicationId,
        c.req.param("datasetVersionId"),
      );
    } catch {
      return c.json(
        {
          message: DATASET_MANIFEST_UNAVAILABLE_MESSAGE,
          code: "datasetManifestUnavailable",
        },
        500,
      );
    }
    if (result.ok === false) {
      if (result.reason === "databaseFailed") {
        return c.json(
          {
            message: DATASET_MANIFEST_UNAVAILABLE_MESSAGE,
            code: "datasetManifestUnavailable",
          },
          500,
        );
      }
      return c.json(
        {
          message: DATASET_VERSION_NOT_FOUND_MESSAGE,
          code: "datasetVersionNotFound",
        },
        404,
      );
    }

    let downloadUrl: string;
    try {
      downloadUrl = await storage.createDownloadUrl(
        result.value.storageKey,
        DOWNLOAD_URL_TTL_SECONDS,
      );
    } catch {
      return c.json(
        {
          message: DATASET_MANIFEST_UNAVAILABLE_MESSAGE,
          code: "datasetManifestUnavailable",
        },
        500,
      );
    }

    const manifest = {
      datasetVersionId: result.value.datasetVersionId,
      datasetId: result.value.datasetId,
      version: result.value.version,
      partition: result.value.partition,
      source: result.value.source,
      license: result.value.license,
      sha256: result.value.sha256,
      sizeBytes: result.value.sizeBytes,
      downloadUrl,
      downloadUrlExpiresAt: new Date(now().getTime() + DOWNLOAD_URL_TTL_SECONDS * 1000).toISOString(),
    };
    const response = SdkValidationDatasetManifestSchema.safeParse({ manifest });
    if (!response.success) {
      return c.json(
        {
          message: DATASET_MANIFEST_UNAVAILABLE_MESSAGE,
          code: "datasetManifestUnavailable",
        },
        500,
      );
    }

    return c.json(response.data);
  });

  return app;
}
