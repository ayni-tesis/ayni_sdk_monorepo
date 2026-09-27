import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { sidebar } from "./src/navigation.ts";

const repository = "https://github.com/ayni-tesis/ayni_sdk_monorepo";

// Static output (Astro's default): Vercel serves `dist/` without an adapter (ADR 0002).
export default defineConfig({
  site: "https://ayni-docs.vercel.app",
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
      },
    }),
  ],
});
