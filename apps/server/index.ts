import { Hono } from "hono";
import app from "./dist/hono-app.mjs";

if (!(app instanceof Hono)) {
  throw new TypeError("The server bundle must export a Hono app");
}

export default app;
