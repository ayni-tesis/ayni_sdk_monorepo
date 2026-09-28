import { describe, expect, it } from "vitest";
import { compareVersions, parseChangelog, releaseSections } from "./changelog";

function changelog(...lines: string[]): string {
  return lines.join("\n");
}

describe("parseChangelog", () => {
  it("reads each version with its date, stability, summary and sections", () => {
    const releases = parseChangelog(
      changelog(
        "# Notas de versión",
        "",
        "## 1.0.0 - 2026-11-02",
        "",
        "Primera versión estable.",
        "",
        "### Novedades",
        "",
        "- Nuevo nodo `crop`.",
        "",
        "### Cambios incompatibles",
        "",
        "- `sync()` devuelve un `SyncResult`.",
        "",
        "### Cómo migrar",
        "",
        "1. Lee `result.status`.",
        "",
        "## 0.1.0-beta.1 - 2026-09-28",
        "",
        "### Correcciones",
        "",
        "- Conserva la última versión válida.",
      ),
    );

    expect(releases).toEqual([
      {
        version: "1.0.0",
        date: "2026-11-02",
        stability: "Estable",
        summary: "Primera versión estable.",
        sections: {
          Novedades: "- Nuevo nodo `crop`.",
          "Cambios incompatibles": "- `sync()` devuelve un `SyncResult`.",
          "Cómo migrar": "1. Lee `result.status`.",
        },
      },
      {
        version: "0.1.0-beta.1",
        date: "2026-09-28",
        stability: "Prerelease",
        summary: "",
        sections: { Correcciones: "- Conserva la última versión válida." },
      },
    ]);
  });

  it("accepts Windows line endings", () => {
    const [release] = parseChangelog(
      "## 1.0.0 - 2026-11-02\r\n\r\n### Novedades\r\n\r\n- Uno.\r\n",
    );

    expect(release?.sections).toEqual({ Novedades: "- Uno." });
  });

  it("has no versions when the changelog has no version heading", () => {
    expect(parseChangelog("# Notas de versión\n\nNada publicado todavía.\n")).toEqual([]);
    expect(parseChangelog("")).toEqual([]);
  });

  it("treats a version with a pre-release identifier as a prerelease, build metadata aside", () => {
    const stability = (version: string) =>
      parseChangelog(`## ${version} - 2026-09-28\n\n### Novedades\n\n- Uno.\n`)[0]?.stability;

    expect(stability("0.1.0-beta.1")).toBe("Prerelease");
    expect(stability("1.0.0-rc.1+build.5")).toBe("Prerelease");
    expect(stability("1.0.0+build-5")).toBe("Estable");
  });

  it("rejects a version heading without a SemVer version and a date", () => {
    expect(() => parseChangelog("## 0.1.0-beta.1\n")).toThrow(
      'The changelog heading "## 0.1.0-beta.1" is not "## <version> - <YYYY-MM-DD>".',
    );
    expect(() => parseChangelog("## 1.0 - 2026-09-28\n")).toThrow(
      'The changelog version "1.0" is not a SemVer version.',
    );
    expect(() => parseChangelog("## 1.0.0 - 2026-02-30\n")).toThrow(
      'The changelog date "2026-02-30" of 1.0.0 is not a calendar date.',
    );
  });

  it("rejects a section that is not one of the four, repeated or out of order", () => {
    expect(() => parseChangelog("## 1.0.0 - 2026-09-28\n\n### Added\n\n- Uno.\n")).toThrow(
      'The changelog section "Added" of 1.0.0 is not one of Novedades, Correcciones, Cambios incompatibles, Cómo migrar.',
    );
    expect(() =>
      parseChangelog(
        "## 1.0.0 - 2026-09-28\n\n### Correcciones\n\n- Uno.\n\n### Novedades\n\n- Dos.\n",
      ),
    ).toThrow(
      "The changelog sections of 1.0.0 must follow the order Novedades, Correcciones, Cambios incompatibles, Cómo migrar.",
    );
    expect(() =>
      parseChangelog(
        "## 1.0.0 - 2026-09-28\n\n### Novedades\n\n- Uno.\n\n### Novedades\n\n- Dos.\n",
      ),
    ).toThrow(
      "The changelog sections of 1.0.0 must follow the order Novedades, Correcciones, Cambios incompatibles, Cómo migrar.",
    );
  });

  it("rejects an empty section and a version without changes", () => {
    expect(() =>
      parseChangelog("## 1.0.0 - 2026-09-28\n\n### Novedades\n\n### Correcciones\n\n- Uno.\n"),
    ).toThrow('The changelog section "Novedades" of 1.0.0 is empty.');
    expect(() => parseChangelog("## 1.0.0 - 2026-09-28\n\nSolo un resumen.\n")).toThrow(
      "The changelog entry of 1.0.0 lists no changes.",
    );
  });

  it("rejects incompatible changes without migration instructions", () => {
    expect(() =>
      parseChangelog("## 2.0.0 - 2026-12-01\n\n### Cambios incompatibles\n\n- Renombra `run()`.\n"),
    ).toThrow('The changelog entry of 2.0.0 has "Cambios incompatibles" without "Cómo migrar".');
  });

  it("rejects versions that are repeated or not from newest to oldest", () => {
    const entry = (version: string) => `## ${version} - 2026-09-28\n\n### Novedades\n\n- Uno.\n`;

    expect(() => parseChangelog(entry("0.1.0-beta.1") + entry("1.0.0"))).toThrow(
      "The changelog must list versions from newest to oldest: 1.0.0 comes after 0.1.0-beta.1.",
    );
    expect(() => parseChangelog(entry("1.0.0") + entry("1.0.0"))).toThrow(
      "The changelog must list versions from newest to oldest: 1.0.0 comes after 1.0.0.",
    );
  });
});

describe("releaseSections", () => {
  it("lists the four sections in order, wording the ones a version leaves out", () => {
    const [release] = parseChangelog("## 1.1.0 - 2026-10-01\n\n### Novedades\n\n- Uno.\n");
    if (!release) throw new Error("No release.");

    expect(releaseSections(release)).toEqual([
      { title: "Novedades", markdown: "- Uno." },
      { title: "Correcciones", markdown: "Sin correcciones." },
      { title: "Cambios incompatibles", markdown: "Sin cambios incompatibles." },
      { title: "Cómo migrar", markdown: "No hace falta migrar." },
    ]);
  });
});

describe("compareVersions", () => {
  it("orders versions by SemVer precedence", () => {
    const ordered = [
      "0.1.0-alpha",
      "0.1.0-alpha.1",
      "0.1.0-alpha.beta",
      "0.1.0-beta",
      "0.1.0-beta.2",
      "0.1.0-beta.11",
      "0.1.0-rc.1",
      "0.1.0",
      "0.2.0",
      "0.10.0",
      "1.0.0",
    ];

    for (const [index, version] of ordered.entries()) {
      for (const [otherIndex, other] of ordered.entries()) {
        expect(Math.sign(compareVersions(version, other)), `${version} vs ${other}`).toBe(
          Math.sign(index - otherIndex),
        );
      }
    }
  });

  it("ignores build metadata", () => {
    expect(compareVersions("1.0.0+build.1", "1.0.0+build.2")).toBe(0);
  });
});
