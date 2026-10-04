import { z } from "zod";

import {
  COLLECTION_IMAGE_QUALITY,
  COLLECTION_MAX_IMAGE_SIZE,
  COLLECTION_NETWORKS,
} from "./collection-policy";

/**
 * The collection policy the SDK reads with `GET /sdk/collection-policy`
 * (US-067): the application's settings, without its ID or update date.
 */
export const sdkCollectionPolicySchema = z
  .object({
    enabled: z.boolean().describe("Si la aplicación permite capturar imágenes para datasets."),
    consentRequired: z
      .boolean()
      .describe("Si el SDK debe contar con el consentimiento de la persona antes de capturar."),
    network: z
      .enum(COLLECTION_NETWORKS)
      .describe("Red por la que se puede enviar la evidencia: `wifi` o `wifiAndCellular`."),
    maxImageSize: z
      .number()
      .int()
      .min(COLLECTION_MAX_IMAGE_SIZE.min)
      .max(COLLECTION_MAX_IMAGE_SIZE.max)
      .describe("Lado mayor, en píxeles, al que el SDK reduce cada imagen de evidencia."),
    imageQuality: z
      .number()
      .int()
      .min(COLLECTION_IMAGE_QUALITY.min)
      .max(COLLECTION_IMAGE_QUALITY.max)
      .describe("Calidad JPEG con la que el SDK comprime cada imagen de evidencia."),
  })
  .strict();
