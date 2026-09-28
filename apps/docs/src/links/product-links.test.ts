import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { docsPages } from "../../../web/src/lib/docs-pages";
import { brokenProductLinks } from "./product-links";

describe("brokenProductLinks", () => {
  let dist: string;

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), "docs-dist-"));
    mkdirSync(join(dist, "comenzar", "inicio-rapido"), { recursive: true });
    writeFileSync(join(dist, "index.html"), "<h1>Ayni Docs</h1>");
    writeFileSync(
      join(dist, "comenzar", "inicio-rapido", "index.html"),
      '<h2 id="2-guarda-la-credencial">2. Guarda la credencial</h2>',
    );
  });

  afterEach(() => rmSync(dist, { recursive: true, force: true }));

  it("accepts links to built pages and to anchors those pages have", () => {
    expect(
      brokenProductLinks(dist, ["/", "/comenzar/inicio-rapido/#2-guarda-la-credencial"]),
    ).toEqual([]);
  });

  it("names a link whose page is not built, as when a page changes its route", () => {
    expect(brokenProductLinks(dist, ["/comenzar/inicio/"])).toEqual([
      "/comenzar/inicio/ (no page at comenzar/inicio/index.html)",
    ]);
  });

  it("names a link whose anchor is missing from its page", () => {
    expect(brokenProductLinks(dist, ["/comenzar/inicio-rapido/#guarda-la-credencial"])).toEqual([
      "/comenzar/inicio-rapido/#guarda-la-credencial (comenzar/inicio-rapido/index.html has no #guarda-la-credencial anchor)",
    ]);
  });

  it("does not take an anchor that only appears in the text for an id", () => {
    writeFileSync(join(dist, "index.html"), "<p>Ver #requisitos o id=requisitos</p>");

    expect(brokenProductLinks(dist, ["/#requisitos"])).toEqual([
      "/#requisitos (index.html has no #requisitos anchor)",
    ]);
  });
});

describe("docsPages", () => {
  it("imports nothing, since astro.config.mjs loads it into the site's build", () => {
    const source = readFileSync(
      new URL("../../../web/src/lib/docs-pages.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/^\s*import\b|\bfrom\s+["']|\b(import|require)\(/m);
  });

  it("are site paths that end in a slash before any anchor, as Starlight builds them", () => {
    for (const path of Object.values(docsPages)) {
      expect(path).toMatch(/^\/([^#]*\/)?(#.+)?$/);
    }
  });
});
