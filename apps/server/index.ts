import { Hono } from "hono";
// The generated bundle may be unavailable or undeclared during type checking.
// biome-ignore lint/suspicious/noTsIgnore: the generated module has environment-dependent declarations
// @ts-ignore
import app from "./dist/hono-app.mjs";

if (!(app instanceof Hono)) {
  throw new TypeError("The server bundle must export a Hono app");
}

export default app;
