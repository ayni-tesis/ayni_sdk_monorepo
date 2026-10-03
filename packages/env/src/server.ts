import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const server = {
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  UPSTASH_REDIS_REST_URL: z.url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  CORS_ORIGIN: z.url(),
  // Vercel Cron sends it to the telemetry retention task; without it the task refuses to run.
  CRON_SECRET: z.string().min(16).optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
};

export const env = createEnv<undefined, typeof server>({
  server,
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
