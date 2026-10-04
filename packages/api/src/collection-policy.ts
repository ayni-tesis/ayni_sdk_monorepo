/**
 * The evidence collection policy of an application, shared by the server and
 * the dashboard. It says whether the SDK may capture images for datasets, over
 * which network it may upload them, and how it optimizes them. Collection is
 * only enabled together with an explicit consent configuration.
 */

/** The networks over which the SDK may upload evidence. */
export const COLLECTION_NETWORKS = ["wifi", "wifiAndCellular"] as const;

export type CollectionNetwork = (typeof COLLECTION_NETWORKS)[number];

export const COLLECTION_NETWORK_LABELS: Record<CollectionNetwork, string> = {
  wifi: "Solo Wi-Fi",
  wifiAndCellular: "Wi-Fi y datos móviles",
};

/**
 * What each network means for the evidence the SDK sends (US-069); the SDK
 * reports the evidence kept for Wi-Fi as `Pendiente de Wi-Fi`.
 */
export const COLLECTION_NETWORK_DESCRIPTIONS: Record<CollectionNetwork, string> = {
  wifi: "La evidencia se envía solo por Wi-Fi: con datos móviles o sin conexión queda pendiente de Wi-Fi y no consume datos móviles.",
  wifiAndCellular:
    "La evidencia se envía por Wi-Fi o por datos móviles, así que puede consumir datos móviles.",
};

/** The longest side of an uploaded image, in pixels. */
export const COLLECTION_MAX_IMAGE_SIZE = { min: 128, max: 4096 } as const;

/** The compression quality of an uploaded image; 100 keeps the most detail. */
export const COLLECTION_IMAGE_QUALITY = { min: 10, max: 100 } as const;

export type CollectionPolicySettings = {
  enabled: boolean;
  /** Whether the SDK must hold the end user's consent before capturing. */
  consentRequired: boolean;
  network: CollectionNetwork;
  maxImageSize: number;
  imageQuality: number;
};

/** The policy of an application that never saved one: collection stays off. */
export const DEFAULT_COLLECTION_POLICY: CollectionPolicySettings = {
  enabled: false,
  consentRequired: false,
  network: "wifi",
  maxImageSize: 1024,
  imageQuality: 80,
};

/** Why a dataset capture cannot be added while collection is not enabled (US-064). */
export const COLLECTION_DISABLED_MESSAGE =
  "Habilita la recolección de evidencia en la configuración de la aplicación.";

export function isCollectionNetwork(value: unknown): value is CollectionNetwork {
  return COLLECTION_NETWORKS.some((network) => network === value);
}
