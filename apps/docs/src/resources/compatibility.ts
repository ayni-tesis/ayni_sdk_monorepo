import { compareVersions, type Release } from "./changelog";

/**
 * What a version of `ayni_sdk` needs from the rest of Ayni (US-148).
 * `minimumServer` is the lowest version of the server's HTTP API (the
 * `info.version` of `packages/api/src/openapi.json`) the SDK works with.
 * `workflowSchema` is the workflow schema version the SDK accepts, `null`
 * while workflows do not declare one (US-098).
 */
export type SdkCompatibility = { minimumServer: string; workflowSchema: string | null };

/** The compatibility of each version in `CHANGELOG.md`. A new version adds its entry. */
export const sdkCompatibility: Record<string, SdkCompatibility> = {
  "0.1.0-beta.1": { minimumServer: "0.1.0", workflowSchema: null },
};

/**
 * The first version of `ayni_sdk` that accepts each node type, in the order
 * of the validator's `_nodeFields`. `Referencia → Esquema de workflow` shows
 * it as `Desde la versión del SDK` (US-145).
 */
export const nodeTypeSince: Record<string, string> = {
  "input.image": "0.1.0-beta.1",
  "model.tflite": "0.1.0-beta.1",
  condition: "0.1.0-beta.1",
  output: "0.1.0-beta.1",
};

/**
 * The section of `Referencia → Esquema de workflow` that describes a node
 * type: its `### \`<type>\`` heading, whose slug drops the dots.
 */
export function nodeTypeLink(type: string): string {
  return `/referencia/esquema-de-workflow/#${type.replaceAll(".", "")}`;
}

export type CompatibilityRow = SdkCompatibility & { sdk: string; nodeTypes: string[] };

/** One row of the `Compatibilidad` table per version, in the order of `releases`. */
export function compatibilityRows(
  releases: Pick<Release, "version">[],
  compatibility: Record<string, SdkCompatibility> = sdkCompatibility,
  since: Record<string, string> = nodeTypeSince,
): CompatibilityRow[] {
  return releases.map(({ version }) => {
    const entry = compatibility[version];
    if (!entry) {
      throw new Error(
        `Declare the compatibility of ayni_sdk ${version} in src/resources/compatibility.ts.`,
      );
    }
    return {
      sdk: version,
      ...entry,
      nodeTypes: Object.keys(since).filter(
        (type) => compareVersions(since[type] ?? "", version) <= 0,
      ),
    };
  });
}
