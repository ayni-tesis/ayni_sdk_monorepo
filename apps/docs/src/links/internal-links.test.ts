import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { brokenInternalLinks } from "./internal-links";

describe("brokenInternalLinks", () => {
  let root: string;
  let dist: string;
  let content: string;

  function write(file: string, text: string) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "docs-links-"));
    dist = join(root, "dist");
    content = join(root, "content");
    write(join(dist, "index.html"), '<a href="/referencia/estados/">Estados</a>');
    write(
      join(dist, "referencia", "estados", "index.html"),
      '<h2 id="estado-general">Estado general</h2><h2 id="revocación">Revocación</h2>',
    );
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("accepts links to built pages and to anchors those pages have", () => {
    write(
      join(dist, "comenzar", "inicio-rapido", "index.html"),
      '<link rel="icon" href="/index.html"><a href="/referencia/estados/#estado-general">a</a>' +
        '<a href="../../referencia/estados#revocaci%C3%B3n">b</a><a href="#paso">c</a>' +
        '<h2 id="paso">Paso</h2><a href="https://pub.dev/packages/ayni_sdk">d</a>' +
        '<a href="mailto:equipo@example.com">e</a><a href="/?q=1#">f</a>',
    );

    expect(brokenInternalLinks(dist, content)).toEqual([]);
  });

  it("names the page, the line and the link whose anchor no longer exists", () => {
    write(
      join(dist, "comenzar", "inicio-rapido", "index.html"),
      '<p><a href="/referencia/estados/#uptodate">Estados</a></p>',
    );
    write(
      join(content, "comenzar", "inicio-rapido.mdx"),
      "---\ntitle: Inicio rápido\n---\n\nVer [Estados](/referencia/estados/#uptodate).\n",
    );

    expect(brokenInternalLinks(dist, content)).toEqual([
      "Enlace roto: /referencia/estados/#uptodate en comenzar/inicio-rapido.mdx:5 (la página no tiene el ancla #uptodate)",
    ]);
  });

  it("finds the line of a link the page writes with accents the HTML encodes", () => {
    write(
      join(dist, "comenzar", "inicio-rapido", "index.html"),
      '<a href="/referencia/estados/#configuraci%C3%B3n">x</a>',
    );
    write(
      join(content, "comenzar", "inicio-rapido.md"),
      'Uno\n<a href="/referencia/estados/#configuración">x</a>\n',
    );

    expect(brokenInternalLinks(dist, content)).toEqual([
      "Enlace roto: /referencia/estados/#configuraci%C3%B3n en comenzar/inicio-rapido.md:2 (la página no tiene el ancla #configuración)",
    ]);
  });

  it("names a link to a page that is not built", () => {
    write(join(dist, "index.html"), '<a href="/comenzar/inicio-rapido/">Inicio</a>');
    write(join(content, "index.mdx"), "[Inicio](/comenzar/inicio-rapido/)\n");

    expect(brokenInternalLinks(dist, content)).toEqual([
      "Enlace roto: /comenzar/inicio-rapido/ en index.mdx:1 (no existe la página)",
    ]);
  });

  it("names the built page of a link no source page writes, once for every page that repeats it", () => {
    for (const page of ["a", "b", "c", "d"]) {
      write(join(dist, page, "index.html"), '<link rel="icon" href="/favicon.svg">');
    }

    expect(brokenInternalLinks(dist, content)).toEqual([
      "Enlace roto: /favicon.svg en a/index.html, b/index.html, c/index.html y 1 página más (no existe la página)",
    ]);
  });

  it("resolves the links of the Dart reference's sidebar fragments from the reference root", () => {
    // `dart doc` loads each fragment into a page and prefixes its links with
    // that page's `data-base-href`, which points to the reference root.
    write(join(dist, "referencia", "api-dart", "ayni_sdk", "AyniSdk-class.html"), '<h2 id="x">');
    write(
      join(dist, "referencia", "api-dart", "ayni_sdk", "AyniSdk-class-sidebar.html"),
      '<a href="ayni_sdk/AyniSdk-class.html#x">x</a><a href="ayni_sdk/AyniSdk/sync.html">sync</a>',
    );

    expect(brokenInternalLinks(dist, content)).toEqual([
      "Enlace roto: ayni_sdk/AyniSdk/sync.html en referencia/api-dart/ayni_sdk/AyniSdk-class-sidebar.html (no existe la página)",
    ]);
  });
});
