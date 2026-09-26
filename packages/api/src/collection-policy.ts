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

export function isCollectionNetwork(value: unknown): value is CollectionNetwork {
  return COLLECTION_NETWORKS.some((network) => network === value);
}
