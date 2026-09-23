import { Hono } from "hono";
// tsdown generates this bundle without declarations.
// @ts-expect-error generated JavaScript bundle has no declaration file
import app from "./dist/hono-app.mjs";

if (!(app instanceof Hono)) {
  throw new TypeError("The server bundle must export a Hono app");
}

export default app;
