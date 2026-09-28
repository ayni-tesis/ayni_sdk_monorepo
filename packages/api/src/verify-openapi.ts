import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createOpenApiDocument } from "./index";
import { type HttpRoute, sdkRouteDrift, sdkRoutesInSource } from "./sdk-routes";

const committedPath = join(import.meta.dirname, "openapi.json");
const serverSourcePath = join(import.meta.dirname, "../../../apps/server/src");

const document = createOpenApiDocument();
let failed = false;

const expectedDocument = JSON.stringify(JSON.parse(readFileSync(committedPath, "utf-8")), null, 2);
if (expectedDocument !== JSON.stringify(document, null, 2)) {
  console.error(
    "OpenAPI document drift detected. Regenerate the committed spec with `bun run openapi:generate`.",
  );
  failed = true;
}

const serverRoutes = readdirSync(serverSourcePath, { recursive: true, encoding: "utf-8" })
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
  .flatMap((file) => sdkRoutesInSource(readFileSync(join(serverSourcePath, file), "utf-8")));
const { undocumented, unimplemented } = sdkRouteDrift(serverRoutes, document);
const list = (routes: HttpRoute[]) =>
  routes.map(({ method, path }) => `${method} ${path}`).join(", ");

if (undocumented.length > 0) {
  console.error(
    `These /sdk/* server routes are missing from the OpenAPI document: ${list(undocumented)}. ` +
      "Describe them in packages/api/src/sdk-openapi.ts.",
  );
  failed = true;
}
if (unimplemented.length > 0) {
  console.error(
    `The OpenAPI document describes /sdk/* routes the server does not declare: ${list(unimplemented)}.`,
  );
  failed = true;
}

if (failed) process.exit(1);

console.log(
  `OpenAPI document is up to date and describes all ${serverRoutes.length} /sdk/* routes.`,
);
