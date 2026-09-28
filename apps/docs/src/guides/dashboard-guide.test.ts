import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dashboardTexts, quotedTexts } from "./dashboard-texts";

const docsRoot = join(import.meta.dirname, "..", "content", "docs");
const page = "guias/preparar-una-aplicacion-en-el-dashboard.mdx";

/** A page under `content/docs`, with `\n` line endings. */
function read(file: string): string {
  return readFileSync(join(docsRoot, file), "utf8").replace(/\r\n/g, "\n");
}

/** The value of `key` in the page's frontmatter, such as `order`. */
function frontmatter(file: string, key: string): string | undefined {
  return new RegExp(`^\\s*${key}:\\s*(.+)$`, "m").exec(read(file).split("\n---\n")[0] ?? "")?.[1];
}

/** Each numbered `## N. …` section of the guide, up to the next `##` heading. */
function steps(): { heading: string; text: string }[] {
  return read(page)
    .split(/\n(?=## )/)
    .filter((part) => /^## \d+\. /.test(part))
    .map((part) => ({ heading: part.slice(3, part.indexOf("\n")), text: part }));
}

describe("Preparar una aplicación en el dashboard (US-142)", () => {
  it("is the first guide", () => {
    const guides = readdirSync(join(docsRoot, "guias"))
      .map((file) => `guias/${file}`)
      .sort((a, b) => Number(frontmatter(a, "order")) - Number(frontmatter(b, "order")));

    expect(guides[0]).toBe(page);
    expect(frontmatter(page, "title")).toBe("Preparar una aplicación en el dashboard");
  });

  it("walks through the five steps in order, each titled as an instruction", () => {
    expect(steps().map(({ heading }) => heading)).toEqual([
      "1. Crea una aplicación",
      "2. Genera una credencial del SDK",
      "3. Registra un modelo y sube una versión",
      "4. Crea un workflow",
      "5. Valida el workflow y publica una versión",
    ]);
  });

  it("names the role each step needs and links its concept", () => {
    const incomplete = steps().filter(
      ({ text }) =>
        !text.includes("**Rol necesario:** «Administrador»") ||
        !/\[[^\]]+\]\(\/conceptos\/[a-z-]+\/(#[^)]+)?\)/.test(text),
    );

    expect(incomplete.map(({ heading }) => heading)).toEqual([]);
  });

  it("marks the screenshot of every step as a pending capture described by its alt", () => {
    const withoutScreenshot = steps().filter(({ text }) => {
      const alt = /<Screenshot\s+alt="([^"]*)"\s*\/>/.exec(text)?.[1] ?? "";
      return alt.length < 20;
    });

    expect(withoutScreenshot.map(({ heading }) => heading)).toEqual([]);
  });

  it("lists the frequent errors of every step with the message and how to solve it", () => {
    const withoutErrors = steps().filter(({ text }) => {
      const errors = text.slice(text.indexOf("\n### Errores frecuentes\n") + 1);
      return (
        !text.includes("\n### Errores frecuentes\n") ||
        !errors.includes("| Mensaje | Qué hacer |") ||
        !/^\| «[^»]+» \| .+ \|$/m.test(errors)
      );
    });

    expect(withoutErrors.map(({ heading }) => heading)).toEqual([]);
  });

  it("warns that the credential is shown only once", () => {
    const credential = steps().find(({ heading }) => heading.includes("credencial"));

    expect(credential?.text).toContain(
      ":::caution[Advertencia]\nLa credencial se muestra una sola vez.",
    );
  });

  it("warns members, before the first step, to ask an administrator for the role", () => {
    const source = read(page);
    const notice = source.indexOf(
      "Necesitas ser administrador del workspace para completar esta guía.",
    );

    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(source.indexOf("\n## 1. "));
    expect(source.slice(notice, source.indexOf("\n:::", notice)).replace(/\s+/g, " ")).toMatch(
      /pide .*a un administrador/,
    );
  });

  it("ends by sending the reader to the SDK quick start", () => {
    const lastParagraph = read(page).trim().split("\n\n").at(-1);

    expect(lastParagraph).toBe(
      "Tu aplicación está lista. Continúa con el\n[Inicio rápido del SDK](/comenzar/inicio-rapido/).",
    );
  });

  it("quotes only texts the dashboard shows", () => {
    const texts = dashboardTexts();
    const quoted = quotedTexts(read(page));

    expect(quoted.length).toBeGreaterThan(0);
    expect(quoted.filter((text) => !texts.has(text))).toEqual([]);
  });

  it("accepts a quote only when it is a whole dashboard text, not part of one", () => {
    const texts = dashboardTexts();

    // A dialog title, a JSX label, and the fixed part of a template literal.
    expect(texts.has("Generar credencial SDK")).toBe(true);
    expect(texts.has("Nueva aplicación")).toBe(true);
    expect(texts.has("Este workflow ya tiene una versión")).toBe(true);
    expect(texts.has("credencial SDK")).toBe(false);
  });
});
