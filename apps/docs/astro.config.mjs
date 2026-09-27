import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { sidebar } from "./src/navigation.ts";
import { searchIndexCoverage } from "./src/search/index-coverage.ts";

const repository = "https://github.com/ayni-tesis/ayni_sdk_monorepo";

/**
 * Starlight's `<Tabs>` renders with `satteri`, a native module. Bundled into
 * the prerender chunks, it cannot find its platform binding under Bun's
 * isolated linker, so pages load it from `node_modules` instead (a direct
 * dependency for that reason). Astro replaces `vite.ssr.external`, hence a
 * plugin (US-140).
 */
const externalizeSatteri = {
  name: "externalize-satteri",
  configEnvironment: (name) =>
    name === "ssr" || name === "prerender" ? { resolve: { external: ["satteri"] } } : undefined,
};

// Static output (Astro's default): Vercel serves `dist/` without an adapter (ADR 0002).
export default defineConfig({
  site: "https://ayni-docs.vercel.app",
  vite: { plugins: [externalizeSatteri] },
  integrations: [
    starlight({
      title: "Ayni Docs",
      description:
        "Orquesta workflows de IA en el dispositivo para apps Flutter, con ejecución offline.",
      defaultLocale: "root",
      locales: { root: { label: "Español", lang: "es" } },
      social: [{ icon: "github", label: "GitHub", href: repository }],
      editLink: { baseUrl: `${repository}/edit/main/apps/docs/` },
      lastUpdated: true,
      sidebar,
      customCss: [
        "@fontsource-variable/geist",
        "@fontsource-variable/geist-mono",
        "./src/styles/theme.css",
      ],
      components: {
        PageTitle: "./src/components/PageTitle.astro",
        Search: "./src/components/Search.astro",
      },
    }),
    searchIndexCoverage(),
  ],
});
