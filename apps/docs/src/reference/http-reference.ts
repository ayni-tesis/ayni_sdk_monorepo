import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// URLs rather than `import.meta.dirname`: `astro.config.mjs` loads this module through Vite.
const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * The API's OpenAPI document, the single source of the HTTP reference
 * (US-144). `openapi:verify` in `packages/api` keeps it in step with the
 * server's `/sdk/*` routes.
 */
export const apiDocumentPath = fromHere("../../../../packages/api/src/openapi.json");

/** Where the docs site's HTTP reference lives, below `Referencia`. */
export const httpReferenceBase = "referencia/api-http";

type ApiDocument = { paths?: Record<string, unknown> } & Record<string, unknown>;

/**
 * The part of the API document the SDK uses: its `/sdk/*` endpoints. The
 * health check and any dashboard route (authenticated by session) stay out.
 */
export function sdkContract<Document extends ApiDocument>(document: Document) {
  return {
    ...document,
    paths: Object.fromEntries(
      Object.entries(document.paths ?? {}).filter(([path]) => path.startsWith("/sdk/")),
    ),
  };
}

/**
 * Writes the SDK contract where `starlight-openapi` reads it, a file under the
 * site's `.astro/` cache (the plugin only reads files or URLs), and returns its
 * path.
 */
export function writeSdkContract(): string {
  const path = fromHere("../../.astro/sdk-openapi.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(sdkContract(JSON.parse(readFileSync(apiDocumentPath, "utf8")))),
  );
  return path;
}
