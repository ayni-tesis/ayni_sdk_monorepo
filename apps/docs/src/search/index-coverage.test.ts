import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { listHtmlFiles, pageUrl, readIndexedUrls, unindexedPages } from "./index-coverage";

describe("pageUrl", () => {
  it("serves an index.html at its directory", () => {
    expect(pageUrl("referencia/estados-y-errores/index.html")).toBe(
      "/referencia/estados-y-errores/",
    );
    expect(pageUrl("index.html")).toBe("/");
  });

  it("keeps the file name of other pages, such as dart doc output", () => {
    expect(pageUrl("referencia/api-dart/ayni_sdk/AyniSdk-class.html")).toBe(
      "/referencia/api-dart/ayni_sdk/AyniSdk-class.html",
    );
  });
});

describe("unindexedPages", () => {
  it("lists built pages missing from the index", () => {
    const built = ["index.html", "guias/uno/index.html", "referencia/api-dart/index.html"];

    expect(unindexedPages(built, ["/", "/guias/uno/"])).toEqual(["/referencia/api-dart/"]);
  });

  it("does not expect any 404 page in the index", () => {
    expect(unindexedPages(["404.html", "en/404.html", "index.html"], ["/"])).toEqual([]);
  });

  it("does not expect dart doc's sidebar fragments or search page in the index", () => {
    const built = [
      "referencia/api-dart/search.html",
      "referencia/api-dart/ayni_sdk/ayni_sdk-library-sidebar.html",
      "referencia/api-dart/ayni_sdk/AyniSdk-class-sidebar.html",
      "referencia/api-dart/ayni_sdk/AyniSdk-class.html",
    ];

    expect(unindexedPages(built, [])).toEqual(["/referencia/api-dart/ayni_sdk/AyniSdk-class.html"]);
  });
});

describe("reading the built site", () => {
  let dist: string;

  afterEach(() => rmSync(dist, { recursive: true, force: true }));

  function fragment(name: string, url: string) {
    const payload = `pagefind_dcd${JSON.stringify({ url, content: "", meta: {} })}`;
    writeFileSync(join(dist, "pagefind", "fragment", name), gzipSync(payload));
  }

  it("reads the URL of every page in Pagefind's fragments", () => {
    dist = mkdtempSync(join(tmpdir(), "docs-dist-"));
    mkdirSync(join(dist, "pagefind", "fragment"), { recursive: true });
    fragment("es_1.pf_fragment", "/");
    fragment("es_2.pf_fragment", "/guias/uno/");

    expect(readIndexedUrls(dist).sort()).toEqual(["/", "/guias/uno/"]);
  });

  it("lists the HTML pages with forward slashes", () => {
    dist = mkdtempSync(join(tmpdir(), "docs-dist-"));
    mkdirSync(join(dist, "guias", "uno"), { recursive: true });
    mkdirSync(join(dist, "_astro"));
    writeFileSync(join(dist, "index.html"), "");
    writeFileSync(join(dist, "guias", "uno", "index.html"), "");
    writeFileSync(join(dist, "_astro", "app.js"), "");

    expect(listHtmlFiles(dist).sort()).toEqual(["guias/uno/index.html", "index.html"]);
  });
});
