import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import pubspec from "../../../../packages/sdk_flutter/pubspec.yaml?raw";
import { ayniSdkSource, constructorParameters } from "./dart-constructor";

const page = readFileSync(
  join(import.meta.dirname, "..", "content", "docs", "comenzar", "instalacion-y-configuracion.mdx"),
  "utf8",
).replace(/\r\n/g, "\n");

/** The text of the `## heading` section, up to the next `##` heading. */
function section(heading: string): string {
  const start = page.indexOf(`\n## ${heading}\n`);
  if (start === -1) throw new Error(`The page has no "${heading}" section.`);
  const end = page.indexOf("\n## ", start + 1);
  return page.slice(start, end === -1 ? undefined : end);
}

/** The body rows of the first Markdown table in `text`, cell by cell. */
function tableRows(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith("|"));
  if (start === -1) return [];
  const end = lines.findIndex((line, index) => index > start && !line.startsWith("|"));
  return lines.slice(start + 2, end === -1 ? undefined : end).map((line) =>
    line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim()),
  );
}

/** How the page words each Dart default value of `AyniSdk`. */
const defaultWording: Record<string, string> = {
  "const Duration(seconds: 30)": "30 segundos",
  false: "`false`",
};

function pubspecValue(key: string): string {
  const match = new RegExp(`^\\s*${key}:\\s*"?([^"\\r\\n]+)"?`, "m").exec(pubspec);
  if (!match?.[1]) throw new Error(`pubspec.yaml has no "${key}".`);
  return match[1].trim();
}

describe("Instalación y configuración (US-140)", () => {
  it("documents every constructor parameter of AyniSdk as the code declares it", () => {
    const expected = constructorParameters(ayniSdkSource, "AyniSdk").map((parameter) => {
      let defaultCell = "—";
      if (parameter.defaultValue !== undefined) {
        const wording = defaultWording[parameter.defaultValue];
        if (wording === undefined) {
          throw new Error(`Word the default "${parameter.defaultValue}" of ${parameter.name}.`);
        }
        defaultCell = wording;
      } else if (!parameter.required) {
        defaultCell = "Ninguno";
      }
      return [
        `\`${parameter.name}\``,
        `\`${parameter.type}\``,
        parameter.required ? "Sí" : "No",
        defaultCell,
      ];
    });

    const documented = tableRows(section("Configurar el cliente")).map((row) => row.slice(0, 4));

    expect(documented).toEqual(expected);
  });

  it("describes the purpose of every parameter", () => {
    const purposes = tableRows(section("Configurar el cliente")).map((row) => row[4] ?? "");

    expect(purposes.filter((purpose) => purpose.length === 0)).toEqual([]);
  });

  it("states the Dart constraint and the version of the package", () => {
    const requirements = section("Requisitos");

    expect(requirements).toContain(`\`${pubspecValue("sdk")}\``);
    expect(requirements).toContain(`\`${pubspecValue("version")}\``);
  });

  it("installs from Git and from a local path, and from pub.dev only once it is published", () => {
    const install = section("Instalar");

    expect(install).toContain('<TabItem label="Desde Git">');
    expect(install).toContain('<TabItem label="Ruta local">');
    if (pubspecValue("publish_to") === "none") {
      expect(install).not.toContain('<TabItem label="pub.dev">');
    }
  });

  it("warns never to allow insecure loopback in production", () => {
    const localDevelopment = section("Entorno de desarrollo local");

    expect(localDevelopment).toMatch(
      /:::danger\r?\nNunca actives `allowInsecureLoopback` en producción\./,
    );
  });

  it("covers storage and each platform", () => {
    expect(section("Directorio de almacenamiento")).toContain("`storageDirectory`");
    const platforms = section("Configuración por plataforma");
    expect(platforms).toContain("### Android");
    expect(platforms).toContain("### iOS");
  });
});
