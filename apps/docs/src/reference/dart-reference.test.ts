import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import pubspec from "../../../../packages/sdk_flutter/pubspec.yaml?raw";
import { listHtmlFiles } from "../search/index-coverage";
import { prepareReferencePage, sdkVersion } from "./dart-reference";

const sdk = { packageName: "ayni_sdk", version: "0.1.0" };

/** The shape of a `dart doc` page, reduced to what the site changes. */
function page({ crumbs, main }: { crumbs: string; main: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<body>
<header id="title">
  <ol class="breadcrumbs gt-separated dark hidden-xs">
    ${crumbs}
  </ol>
</header>
<main>
${main}
</main>
</body>
</html>`;
}

const symbolPage = page({
  crumbs: `<li><a href="../index.html">ayni_sdk</a></li>
    <li><a href="../ayni_sdk/">ayni_sdk.dart</a></li>
    <li class="self-crumb">SyncStatus enum</li>`,
  main: `<div
    id="dartdoc-main-content"
    class="main-content">
<h1><span class="kind-enum">SyncStatus</span> enum</h1>
</div>`,
});

describe("prepareReferencePage", () => {
  it("declares the page in Spanish, so Pagefind adds it to the site's only index", () => {
    expect(prepareReferencePage(symbolPage, sdk)).toContain('<html lang="es">');
  });

  it("declares the main content in English, the language of its /// comments", () => {
    expect(prepareReferencePage(symbolPage, sdk)).toContain('id="dartdoc-main-content" lang="en"');
  });

  it("lets the site's search index the main content", () => {
    expect(prepareReferencePage(symbolPage, sdk)).toContain(
      'id="dartdoc-main-content" lang="en" data-pagefind-body',
    );
  });

  it("keeps a page out of the search index when it is not searchable", () => {
    const prepared = prepareReferencePage(symbolPage, { ...sdk, searchable: false });

    expect(prepared).not.toContain("data-pagefind-body");
    expect(prepared).toContain('<html lang="es">');
    expect(prepared).toContain('id="dartdoc-main-content" lang="en"');
  });

  it("links back to the site and names the documented version in the header", () => {
    expect(prepareReferencePage(symbolPage, sdk)).toContain(
      '<li><a href="/">Ayni Docs</a></li><li><a href="../index.html">ayni_sdk 0.1.0</a></li>',
    );
  });

  it("names the version on the package page too, where the crumb is not a link", () => {
    const packagePage = page({
      crumbs: '<li class="self-crumb">ayni_sdk package</li>',
      main: '<div id="dartdoc-main-content" class="main-content"></div>',
    });

    expect(prepareReferencePage(packagePage, sdk)).toContain(
      '<li><a href="/">Ayni Docs</a></li><li class="self-crumb">ayni_sdk 0.1.0</li>',
    );
  });

  it("marks deprecated members of a listing with an Obsoleto badge", () => {
    const listing = page({
      crumbs: '<li class="self-crumb">AyniSdk class</li>',
      main: `<div id="dartdoc-main-content" class="main-content">
<dl class="callables">
  <dt id="oldSync" class="callable">
  <span class="name deprecated"><a class="deprecated" href="../ayni_sdk/AyniSdk/oldSync.html">oldSync</a></span><span class="signature">(<wbr>)</span>
</dt>
<dd>Use sync instead.</dd>
  <dt id="sync" class="callable">
  <span class="name"><a href="../ayni_sdk/AyniSdk/sync.html">sync</a></span><span class="signature">(<wbr>)</span>
</dt>
<dd>Syncs.</dd>
</dl>
</div>`,
    });

    const prepared = prepareReferencePage(listing, sdk);

    expect(prepared.match(/Obsoleto/g)).toHaveLength(1);
    expect(prepared).toContain(
      '<span class="signature">(<wbr>)</span><span class="feature">Obsoleto</span>\n</dt>\n<dd>Use sync instead.</dd>',
    );
  });

  it("marks the heading of a deprecated symbol's own page with an Obsoleto badge", () => {
    const deprecatedPage = page({
      crumbs: `<li><a href="../../index.html">ayni_sdk</a></li>
    <li class="self-crumb"><span class="deprecated">oldSync</span> method</li>`,
      main: `<div id="dartdoc-main-content" class="main-content">
<h1><span class="kind-method">oldSync</span> method
</h1>
</div>`,
    });

    expect(prepareReferencePage(deprecatedPage, sdk)).toContain(
      '<h1><span class="kind-method">oldSync</span> method\n<span class="feature">Obsoleto</span></h1>',
    );
  });

  it("adds no badge to a page without deprecated symbols", () => {
    expect(prepareReferencePage(symbolPage, sdk)).not.toContain("Obsoleto");
  });

  it("leaves HTML fragments without a page structure unchanged", () => {
    const sidebar = '<ol>\n  <li><a href="ayni_sdk/AyniSdk-class.html">AyniSdk</a></li>\n</ol>';

    expect(prepareReferencePage(sidebar, sdk)).toBe(sidebar);
  });
});

describe("sdkVersion", () => {
  it("reads the version of the package's pubspec", () => {
    expect(sdkVersion("name: ayni_sdk\r\ndescription: SDK.\r\nversion: 0.1.0\r\n")).toBe("0.1.0");
  });

  it("fails when the pubspec has no version", () => {
    expect(() => sdkVersion("name: ayni_sdk\n")).toThrow("The pubspec has no version.");
  });
});

/**
 * The committed `dart doc` output that the site serves. CI regenerates it
 * and fails when it differs, so these tests read what visitors get.
 */
const reference = join(import.meta.dirname, "../../public/referencia/api-dart");
const read = (file: string) => readFileSync(join(reference, file), "utf8");
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Each value of an enum page, with the text of its description. */
function enumValues(html: string): { name: string; description: string }[] {
  const values = /<section class="summary offset-anchor" id="values">([\s\S]*?)<\/section>/.exec(
    html,
  )?.[1];
  if (!values) throw new Error("The page lists no enum values.");
  return [...values.matchAll(/<dt id="(\w+)" class="constant">[\s\S]*?<dd>([\s\S]*?)<\/dd>/g)].map(
    ([, name = "", description = ""]) => ({ name, description: text(description) }),
  );
}

describe("committed Dart reference", () => {
  const pages = listHtmlFiles(reference).filter((page) => !page.endsWith("-sidebar.html"));

  it("adapts every page to the site", () => {
    const unprepared = pages.filter((page) => {
      const html = read(page);
      return !html.includes('<html lang="es">') || !html.includes('<a href="/">Ayni Docs</a>');
    });

    expect(pages.length).toBeGreaterThan(0);
    expect(unprepared).toEqual([]);
  });

  it("names the version of the documented package in every header", () => {
    const header = `ayni_sdk ${sdkVersion(pubspec)}`;

    expect(pages.filter((page) => !read(page).includes(header))).toEqual([]);
  });

  it("indexes every page for search except dart doc's own search page", () => {
    const unindexed = pages.filter((page) => !read(page).includes("data-pagefind-body"));

    expect(unindexed).toEqual(["search.html"]);
  });

  it.each([
    "SyncStatus",
    "SyncResourceStatus",
    "SyncResourceType",
    "InitializationStatus",
    "WorkflowErrorCategory",
  ])("describes every value of %s", (name) => {
    const values = enumValues(read(`ayni_sdk/${name}.html`));

    expect(values.length).toBeGreaterThan(0);
    expect(values.filter((value) => value.description === "")).toEqual([]);
  });

  it("shows the type, default, and timeout result of AyniSdk's syncTimeout", () => {
    const constructorPage = text(read("ayni_sdk/AyniSdk/AyniSdk.html"));
    const property = text(read("ayni_sdk/AyniSdk/syncTimeout.html"));

    expect(constructorPage).toContain("Duration syncTimeout = const Duration(seconds: 30)");
    expect(property).toContain("Defaults to 30 seconds.");
    expect(property).toContain("returns a SyncResult with SyncStatus.error");
  });
});
