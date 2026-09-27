import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import context from "../../../../CONTEXT.md?raw";
import { contextTerms } from "./context-terms";
import { glossary, termAnchor } from "./glossary";

const terms = contextTerms(context);
const docsRoot = join(import.meta.dirname, "..", "content", "docs");

describe("glossary (US-141)", () => {
  it("translates every term of CONTEXT.md, in the same order", () => {
    expect(terms.map(({ term }) => term)).toContain("Workflow Version");
    expect(terms.map(({ term }) => term)).toContain("Offline Sync");
    expect(glossary.map(({ source }) => source)).toEqual(terms.map(({ term }) => term));
  });

  it("translates every avoided term of each entry", () => {
    const counts = glossary.map(({ source, avoid }) => [source, avoid.length]);

    expect(counts).toEqual(terms.map(({ term, avoid }) => [term, avoid.length]));
  });

  it("defines every term", () => {
    const undefinedTerms = glossary.filter(({ definition }) => definition.trim() === "");

    expect(undefinedTerms).toEqual([]);
  });

  it("links each term only to concept pages that exist", () => {
    const missing = glossary.flatMap(({ concept }) => {
      if (concept === undefined) return [];
      const [path] = concept.split("#");
      const page = join(docsRoot, ...(path ?? "").split("/").filter(Boolean));
      return existsSync(`${page}.md`) || existsSync(`${page}.mdx`) ? [] : [concept];
    });

    expect(missing).toEqual([]);
  });

  it("anchors each term at a unique, accent-free id", () => {
    expect(termAnchor("Versión de workflow")).toBe("version-de-workflow");
    expect(termAnchor("Credencial del SDK")).toBe("credencial-del-sdk");
    const anchors = glossary.map(({ term }) => termAnchor(term));
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it("marks the policies the SDK does not apply yet as coming soon", () => {
    const comingSoon = glossary.filter((entry) => entry.comingSoon).map(({ source }) => source);

    expect(comingSoon).toEqual(["Telemetry Policy", "Collection Policy"]);
  });
});
