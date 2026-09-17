import { env } from "@ayni/env/server";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index";

const sql = postgres(env.DATABASE_URL);
export const db = drizzle(sql, { schema });
