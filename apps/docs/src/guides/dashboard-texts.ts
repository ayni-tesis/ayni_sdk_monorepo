import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

// Guides quote dashboard texts between « and » (US-142, US-146). Only tests
// import this module, so the site's build never bundles the TypeScript
// compiler.

const repositoryRoot = join(import.meta.dirname, "..", "..", "..", "..");
// The dashboard's own texts, and the server messages it shows as they come.
const dashboardSources = ["apps/web/src", "apps/server/src", "packages/api/src"];

/** `text` without surrounding whitespace, each inner run of it as one space. */
function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Every whole text the dashboard's source can show: each string literal, each
 * JSX text, and each fixed part of a template literal around its `${…}`. A
 * quote must equal one of them, so part of a longer label never passes.
 */
export function dashboardTexts(): Set<string> {
  const texts = new Set<string>();
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    )
      texts.add(collapse(node.text));
    ts.forEachChild(node, visit);
  };
  for (const directory of dashboardSources) {
    const files = readdirSync(join(repositoryRoot, directory), {
      recursive: true,
      encoding: "utf8",
    }).filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
    for (const file of files) {
      const source = readFileSync(join(repositoryRoot, directory, file), "utf8");
      visit(ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX));
    }
  }
  return texts;
}

/** Every text `page` quotes from the dashboard between « and ». */
export function quotedTexts(page: string): string[] {
  return [...page.matchAll(/«([^»]+)»/g)].map(([, text]) => collapse(text ?? ""));
}
