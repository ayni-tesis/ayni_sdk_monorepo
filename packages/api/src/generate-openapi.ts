import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { createOpenApiDocument } from "./index";

writeFileSync(
  join(import.meta.dirname, "openapi.json"),
  `${JSON.stringify(createOpenApiDocument(), null, 2)}\n`,
);
