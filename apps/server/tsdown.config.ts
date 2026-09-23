import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/hono-app.ts",
  format: "esm",
  outDir: "./dist",
  clean: true,
  dts: false,
  noExternal: [/@ayni\/.*/],
});
