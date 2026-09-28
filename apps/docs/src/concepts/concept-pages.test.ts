import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import pubspec from "../../../../packages/sdk_flutter/pubspec.yaml?raw";
import { glossary } from "../glossary/glossary";

const docsRoot = join(import.meta.dirname, "..", "content", "docs");

function read(page: string): string {
  return readFileSync(join(docsRoot, page), "utf8").replace(/\r\n/g, "\n");
}

/** The text of the `## heading` section, up to the next `##` heading. */
function section(page: string, heading: string): string {
  const source = read(page);
  const start = source.indexOf(`\n## ${heading}\n`);
  if (start === -1) throw new Error(`${page} has no "${heading}" section.`);
  const end = source.indexOf("\n## ", start + 1);
  return source.slice(start, end === -1 ? undefined : end);
}

function frontmatter(page: string, key: string): string | undefined {
  return new RegExp(`^\\s*${key}:\\s*(.+)$`, "m").exec(read(page).split("\n---\n")[0] ?? "")?.[1];
}

/** The `alt` of every `<Diagram>` on the page. */
function diagramAlts(page: string): string[] {
  return [...read(page).matchAll(/<Diagram\b[^>]*?>/gs)].map(
    ([tag]) => /\balt="([^"]*)"/.exec(tag)?.[1]?.trim() ?? "",
  );
}

const conceptPages = {
  "Workspaces y aplicaciones": "conceptos/workspaces-y-aplicaciones.mdx",
  "Credenciales del SDK": "conceptos/credenciales-del-sdk.mdx",
  "Modelos y versiones": "conceptos/modelos-y-versiones.mdx",
  "Workflows DAG": "conceptos/workflows-dag.mdx",
  "Sincronización offline": "conceptos/sincronizacion-offline.mdx",
};

describe("Conceptos (US-141)", () => {
  it("lists one page per concept, then the glossary", () => {
    const pages = readdirSync(join(docsRoot, "conceptos")).map((file) => `conceptos/${file}`);
    const ordered = pages
      .map((page) => ({
        title: frontmatter(page, "title"),
        order: Number(frontmatter(page, "order")),
      }))
      .sort((a, b) => a.order - b.order)
      .map(({ title }) => title);

    expect(ordered).toEqual([...Object.keys(conceptPages), "Glosario"]);
  });

  it.each(Object.entries(conceptPages))("%s defines its terms from the glossary", (_, page) => {
    const terms = [...read(page).matchAll(/<Definition term="([^"]+)"/g)].map(([, term]) => term);

    expect(terms.length).toBeGreaterThan(0);
    expect(terms.filter((term) => !glossary.some(({ source }) => source === term))).toEqual([]);
  });

  it.each(Object.entries(conceptPages))(
    "%s shows a diagram, its rules and related terms",
    (_, page) => {
      expect(diagramAlts(page).length).toBeGreaterThan(0);
      expect(section(page, "Reglas")).toMatch(/^- /m);
      expect(section(page, "Términos relacionados")).toMatch(/^- \[.+\]\(\/conceptos\/.+\)/m);
    },
  );

  it("gives every diagram of the site an equivalent text alternative", () => {
    const pages = readdirSync(docsRoot, { recursive: true, encoding: "utf8" }).filter((page) =>
      page.endsWith(".mdx"),
    );
    const withoutAlt = pages.filter((page) => diagramAlts(page).some((alt) => alt.length < 20));

    expect(withoutAlt).toEqual([]);
  });

  it("states that a published model version is immutable", () => {
    expect(section(conceptPages["Modelos y versiones"], "Reglas")).toContain(
      "- Una versión publicada es inmutable.",
    );
  });

  it("explains how a credential is shown, stored and revoked", () => {
    const rules = section(conceptPages["Credenciales del SDK"], "Reglas");

    expect(rules).toContain("El secreto se muestra una sola vez");
    expect(rules).toContain("solo su hash SHA-256");
    expect(rules).toContain("no borra los recursos ya instalados en los dispositivos");
    expect(rules).toContain("Regenerar una credencial revoca la anterior");
  });

  it("follows a workflow from draft to an immutable published version", () => {
    const rules = section(conceptPages["Workflows DAG"], "Reglas");

    expect(rules).toContain("Se diseña como borrador");
    expect(rules).toContain("Una versión publicada es inmutable.");
  });

  it("explains that the SDK downloads, validates and keeps workflows for use without a network", () => {
    const page = conceptPages["Sincronización offline"];
    const rules = section(page, "Reglas");

    expect(diagramAlts(page).join(" ")).toMatch(/descarga.*valida.*instala/i);
    expect(rules).toContain("sin red");
    expect(section(page, "Instalación atómica")).toContain(
      "se conserva la última combinación válida de workflow y modelos",
    );
  });
});

describe("¿Qué es Ayni? (US-141)", () => {
  const page = "comenzar/que-es-ayni.mdx";

  it("draws the path from the dashboard to the SDK on the device", () => {
    expect(read(page)).toMatch(
      /<Diagram[^>]*steps=\{\[\s*"Dashboard\/API",\s*"Sincronización",\s*"SDK Flutter en el dispositivo",?\s*\]\}/s,
    );
  });

  it("notes that inference runs on the device", () => {
    expect(read(page)).toContain(
      ":::note\nEl dashboard no ejecuta los modelos: la inferencia ocurre en el dispositivo.\n:::",
    );
  });

  it("names the version of the package it describes", () => {
    const version = /^version:\s*(\S+)/m.exec(pubspec)?.[1];

    expect(section(page, "Qué hace el SDK")).toContain(`La versión ${version} del SDK`);
  });

  it("lists what the SDK does and does not do", () => {
    expect(section(page, "Qué hace el SDK")).toMatch(/^- /m);
    expect(section(page, "Qué no hace el SDK")).toMatch(/^- /m);
  });
});

describe("Glosario (US-141)", () => {
  it("renders the glossary built from CONTEXT.md", () => {
    expect(read("conceptos/glosario.mdx")).toContain("<Glossary />");
  });
});
