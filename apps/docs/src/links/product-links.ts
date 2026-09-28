import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";

/**
 * The links of `links` that point to no built page, or to an anchor their
 * page lacks, each with its cause. A link is a site path such as
 * `/comenzar/inicio-rapido/#2-guarda-la-credencial`; `dist` is the built site.
 */
export function brokenProductLinks(dist: string, links: string[]): string[] {
  return links.flatMap((link) => {
    const [path = "", anchor] = link.split("#");
    const htmlFile = `${path.slice(1)}index.html`;
    const file = join(dist, htmlFile);
    if (!existsSync(file)) return [`${link} (no page at ${htmlFile})`];
    if (anchor && !readFileSync(file, "utf8").includes(`id="${anchor}"`)) {
      return [`${link} (${htmlFile} has no #${anchor} anchor)`];
    }
    return [];
  });
}

/**
 * Fails the build when the landing or the dashboard links to a page or
 * anchor of this site that does not exist (US-149). The links live in
 * `apps/web/src/lib/docs-pages.ts`.
 */
export function productLinkCoverage(links: string[]): AstroIntegration {
  return {
    name: "ayni:product-link-coverage",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        const broken = brokenProductLinks(fileURLToPath(dir), links);
        if (broken.length > 0) {
          throw new Error(
            `Broken product links to the documentation: ${broken.join("; ")}. ` +
              "Update apps/web/src/lib/docs-pages.ts or restore the page (US-149).",
          );
        }
        logger.info("Every product link points to an existing page and anchor.");
      },
    },
  };
}
