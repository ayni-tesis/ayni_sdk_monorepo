import { existsSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { listHtmlFiles } from "../search/index-coverage";

/**
 * `dart doc` loads each `*-sidebar.html` fragment into a page and prefixes
 * its links with that page's `data-base-href`, the reference root (US-143).
 */
const dartSidebarFragment = /^referencia\/api-dart\/.*-sidebar\.html$/;
const dartReferenceRoot = "referencia/api-dart";

/** How many locations a message names before it only counts the rest. */
const shownLocations = 3;

/**
 * Every link of the built site (`dist`) to a page that is not built or to an
 * anchor its page lacks, as `Enlace roto: <link> en <location> (<cause>)`.
 * The location is the source page and line under `contentDir` that writes
 * the link or, for links the pages do not write (such as those of the theme
 * or of the Dart reference), the built page. A link repeated on several
 * pages yields one message (US-150).
 */
export function brokenInternalLinks(dist: string, contentDir: string): string[] {
  const ids = new Map<string, Set<string>>();
  const anchorsOf = (htmlFile: string) => {
    let found = ids.get(htmlFile);
    if (!found) {
      const html = readFileSync(join(dist, htmlFile), "utf8");
      found = new Set([...html.matchAll(/\s(?:id|name)="([^"]*)"/g)].map(([, id]) => id ?? ""));
      ids.set(htmlFile, found);
    }
    return found;
  };

  const broken = new Map<string, { href: string; cause: string; locations: string[] }>();
  for (const htmlFile of listHtmlFiles(dist)) {
    const html = readFileSync(join(dist, htmlFile), "utf8");
    for (const [, attribute] of html.matchAll(/\shref="([^"]*)"/g)) {
      const href = (attribute ?? "").replace(/&amp;/g, "&");
      const cause = linkProblem(dist, htmlFile, href, anchorsOf);
      if (!cause) continue;
      const key = `${href}\n${cause}`;
      const entry = broken.get(key) ?? { href, cause, locations: [] };
      entry.locations.push(sourceLocation(contentDir, htmlFile, href) ?? htmlFile);
      broken.set(key, entry);
    }
  }
  return [...broken.values()].map(
    ({ href, cause, locations }) =>
      `Enlace roto: ${href} en ${listLocations([...new Set(locations)])} (${cause})`,
  );
}

/** Why `href`, found in `htmlFile`, points nowhere; `undefined` when it resolves. */
function linkProblem(
  dist: string,
  htmlFile: string,
  href: string,
  anchorsOf: (htmlFile: string) => Set<string>,
): string | undefined {
  // Other schemes (https:, mailto:, data:…) and protocol-relative links leave the site.
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//")) return undefined;
  const [pathAndQuery = "", anchor = ""] = href.split("#");
  const path = pathAndQuery.split("?")[0] ?? "";

  let target = htmlFile;
  if (path !== "") {
    const base = dartSidebarFragment.test(htmlFile) ? dartReferenceRoot : posix.dirname(htmlFile);
    const resolved = posix
      .join(path.startsWith("/") ? "" : base, safeDecode(path))
      .replace(/^\//, "");
    const found = [resolved, posix.join(resolved, "index.html")].find((candidate) => {
      const file = join(dist, candidate);
      return existsSync(file) && statSync(file).isFile();
    });
    if (!found) return "no existe la página";
    target = found;
  }
  const id = safeDecode(anchor);
  if (id === "" || !target.endsWith(".html") || anchorsOf(target).has(id)) return undefined;
  return `la página no tiene el ancla #${id}`;
}

/** The `<page>:<line>` of the source page of `htmlFile` that writes `href`. */
function sourceLocation(contentDir: string, htmlFile: string, href: string): string | undefined {
  const route = htmlFile.replace(/(^|\/)index\.html$/, "").replace(/\.html$/, "");
  const stem = route === "" ? "index" : route.replace(/\/$/, "");
  const candidates = [".md", ".mdx"].flatMap((extension) => [
    `${stem}${extension}`,
    `${stem}/index${extension}`,
  ]);
  const page = candidates.find((candidate) => existsSync(join(contentDir, candidate)));
  if (!page) return undefined;
  const wanted = safeDecode(href);
  const lines = readFileSync(join(contentDir, page), "utf8").split(/\r?\n/);
  const index = lines.findIndex((line) =>
    [...line.matchAll(/\]\(\s*<?([^)\s>]+)|\shref=["']([^"']+)/g)].some(
      ([, markdown, attribute]) => safeDecode(markdown ?? attribute ?? "") === wanted,
    ),
  );
  return index === -1 ? undefined : `${page}:${index + 1}`;
}

function listLocations(locations: string[]): string {
  const shown = locations.slice(0, shownLocations).join(", ");
  const rest = locations.length - shownLocations;
  if (rest <= 0) return shown;
  return `${shown} y ${rest} ${rest === 1 ? "página más" : "páginas más"}`;
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Fails the build when a built page links to a page or anchor of this site
 * that does not exist, naming the page, line and link (US-150). Must run
 * after every page, including the Dart reference, is in `dist`.
 */
export function internalLinkCoverage(contentDir: string): AstroIntegration {
  return {
    name: "ayni:internal-link-coverage",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        const broken = brokenInternalLinks(fileURLToPath(dir), contentDir);
        if (broken.length > 0) {
          throw new Error(
            `The documentation has broken internal links:\n${broken.join("\n")}\n` +
              "Fix the link or restore the page or heading it points to (US-150).",
          );
        }
        logger.info("Every internal link points to an existing page and anchor.");
      },
    },
  };
}
