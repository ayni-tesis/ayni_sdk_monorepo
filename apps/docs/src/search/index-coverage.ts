import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import type { AstroIntegration } from "astro";

/**
 * Built pages that search must not return: the 404 of any locale, and the
 * parts of the Dart reference (US-143) that are not content: the sidebar
 * fragments its script loads and its own search results page. A page that
 * sets `pagefind: false` in its frontmatter must be added here too.
 */
const unsearchablePages = [
  /(^|\/)404\.html$/,
  /^referencia\/api-dart\/.*-sidebar\.html$/,
  /^referencia\/api-dart\/search\.html$/,
];

/** The URL Pagefind records for a built HTML file (a path relative to `dist`). */
export function pageUrl(htmlFile: string): string {
  return `/${htmlFile.replace(/(^|\/)index\.html$/, "$1")}`;
}

export function unindexedPages(htmlFiles: string[], indexedUrls: string[]): string[] {
  const indexed = new Set(indexedUrls);
  return htmlFiles
    .filter((file) => !unsearchablePages.some((page) => page.test(file)))
    .map(pageUrl)
    .filter((url) => !indexed.has(url));
}

export function listHtmlFiles(dist: string, directory = dist): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listHtmlFiles(dist, path);
    return entry.name.endsWith(".html") ? [relative(dist, path).split(sep).join("/")] : [];
  });
}

/**
 * Pagefind 1.x writes one gzipped fragment per indexed page: a `pagefind_dcd`
 * signature followed by JSON with the page URL.
 */
export function readIndexedUrls(dist: string): string[] {
  const fragments = join(dist, "pagefind", "fragment");
  return readdirSync(fragments).map((name) => {
    const text = gunzipSync(readFileSync(join(fragments, name))).toString("utf8");
    const json = text.slice(text.indexOf("{"));
    return (JSON.parse(json) as { url: string }).url;
  });
}

/**
 * Fails the build when a built page is missing from the search index, so
 * pages added outside Starlight (such as `dart doc` output) cannot silently
 * drop out of search. Must run after Starlight has built the index.
 */
export function searchIndexCoverage(): AstroIntegration {
  return {
    name: "ayni:search-index-coverage",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        const dist = fileURLToPath(dir);
        const missing = unindexedPages(listHtmlFiles(dist), readIndexedUrls(dist));
        if (missing.length > 0) {
          throw new Error(
            `These pages are missing from the search index: ${missing.join(", ")}. ` +
              "Index them through Pagefind's configuration (US-138).",
          );
        }
        logger.info("Every built page is in the search index.");
      },
    },
  };
}
