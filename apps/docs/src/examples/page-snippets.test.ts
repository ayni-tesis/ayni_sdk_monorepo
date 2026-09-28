import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dartSnippetsOutsideExamples } from "./page-snippets";

describe("dartSnippetsOutsideExamples", () => {
  it("accepts a page that shows an example region through <Code>", () => {
    const page = [
      'import { Code } from "@astrojs/starlight/components";',
      'import { quickstart } from "../../../examples/quickstart";',
      "",
      '<Code code={quickstart.sync} lang="dart" />',
      "",
      "```yaml",
      "dependencies:",
      "```",
    ].join("\n");

    expect(dartSnippetsOutsideExamples({ "comenzar/inicio-rapido.mdx": page })).toEqual([]);
  });

  it("names the page and line of a dart block written in the page", () => {
    const page = '# Título\n\nTexto\n\n```dart title="main.dart"\nawait sdk.sincronizar();\n```\n';

    expect(dartSnippetsOutsideExamples({ "guias/x.md": page })).toEqual([
      "Fragmento Dart escrito en la página: guias/x.md:5",
    ]);
  });

  it("names a <Code> whose Dart code is not an example region", () => {
    const page = [
      'import { Code } from "@astrojs/starlight/components";',
      'import { quickstart } from "../../../examples/quickstart";',
      "const legacy = 'await sdk.sincronizar();';",
      "",
      "<Code",
      "  code={legacy}",
      '  lang="dart"',
      "/>",
      "<Code code=\"await sdk.sync();\" lang='dart' />",
      '<Code code={quickstart.sync} lang="yaml" />',
    ].join("\n");

    expect(dartSnippetsOutsideExamples({ "comenzar/x.mdx": page })).toEqual([
      "Fragmento Dart escrito en la página: comenzar/x.mdx:5",
      "Fragmento Dart escrito en la página: comenzar/x.mdx:9",
    ]);
  });

  it("finds no dart code written in the site's pages", () => {
    const docs = join(import.meta.dirname, "..", "content", "docs");
    const pages = Object.fromEntries(
      readdirSync(docs, { recursive: true, encoding: "utf8" })
        .filter((file) => /\.mdx?$/.test(file))
        .map((file) => [file.replace(/\\/g, "/"), readFileSync(join(docs, file), "utf8")]),
    );

    expect(Object.keys(pages).length).toBeGreaterThan(10);
    expect(dartSnippetsOutsideExamples(pages)).toEqual([]);
  });
});
