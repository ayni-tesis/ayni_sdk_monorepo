import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The modules `from` reaches through relative imports, each with the
 * package imports it makes.
 */
function packageImports(from: string): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  const visit = (file: string) => {
    if (file in found) return;
    const source = readFileSync(file, "utf8");
    const specifiers = [
      // `import type` is erased from the bundle, so it may name any package.
      ...source.matchAll(/^\s*(?:import|export)\b(?!\s+type\b)[^"']*?from\s*["']([^"']+)["']/gm),
    ]
      .map(([, specifier]) => specifier ?? "")
      .concat([...source.matchAll(/^\s*import\s*["']([^"']+)["']/gm)].map(([, s]) => s ?? ""))
      // Dynamic `import("…")` with a literal specifier, which also ends up in the bundle.
      .concat([...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map(([, s]) => s ?? ""));
    found[file] = specifiers.filter((specifier) => !specifier.startsWith("."));
    for (const specifier of specifiers.filter((s) => s.startsWith("."))) {
      visit(join(dirname(file), `${specifier.replace(/\.ts$/, "")}.ts`));
    }
  };
  visit(from);
  return found;
}

describe("packageImports", () => {
  it("finds the packages a module imports dynamically and follows its dynamic relative imports", () => {
    const dir = mkdtempSync(join(tmpdir(), "client-imports-"));
    try {
      writeFileSync(
        join(dir, "dialog.ts"),
        'export async function load() {\n  await import("./lazy");\n  return import( "starlight-openapi" );\n}\n',
      );
      writeFileSync(join(dir, "lazy.ts"), 'export const bytes = () => import("node:crypto");\n');

      expect(packageImports(join(dir, "dialog.ts"))).toEqual({
        [join(dir, "dialog.ts")]: ["starlight-openapi"],
        [join(dir, "lazy.ts")]: ["node:crypto"],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("search dialog modules", () => {
  it("import no package, so the browser never loads Node-only code such as starlight-openapi", () => {
    // The dialog's `<script>` in `components/Search.astro` runs these modules in
    // the browser, where Vite replaces `node:crypto` with an empty module: a
    // package that needs it breaks the whole dialog when the page loads.
    const root = join(import.meta.dirname, "search-dialog.ts");
    const withPackages = Object.entries(packageImports(root))
      .filter(([, packages]) => packages.length > 0)
      .map(
        ([file, packages]) =>
          `${file.slice(join(import.meta.dirname, "..").length + 1)}: ${packages.join(", ")}`,
      );

    expect(withPackages).toEqual([]);
  });
});
