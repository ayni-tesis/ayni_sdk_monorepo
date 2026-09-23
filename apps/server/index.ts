import { Hono } from "hono";
// The generated bundle has no stable declaration in all build environments.
// @ts-expect-error
import app from "./dist/hono-app.mjs";

if (!(app instanceof Hono)) {
  throw new TypeError("The server bundle must export a Hono app");
}

export default app;
