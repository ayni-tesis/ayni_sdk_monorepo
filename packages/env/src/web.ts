import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    NEXT_PUBLIC_SERVER_URL: z.url().default("http://localhost:3000"),
    // Base URL of the SDK documentation site (`apps/docs`, port 3002 in development).
    NEXT_PUBLIC_DOCS_URL: z.url().default("http://localhost:3002"),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
    NEXT_PUBLIC_DOCS_URL: process.env.NEXT_PUBLIC_DOCS_URL,
  },
  emptyStringAsUndefined: true,
});
