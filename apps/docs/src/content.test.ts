import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { sidebarGroups } from "./navigation";

const docsRoot = join(import.meta.dirname, "content", "docs");
// Pages Starlight renders outside the sidebar on purpose.
const standalonePages = ["index.mdx", "404.mdx"];

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return /\.mdx?$/.test(entry.name) ? [relative(docsRoot, path)] : [];
  });
}

function bodyOf(page: string): string {
  const source = readFileSync(join(docsRoot, page), "utf8");
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
}

const pages = pageFiles(docsRoot);
const sidebarPages = pages.filter((page) => !standalonePages.includes(page));
const groupDirectories: string[] = sidebarGroups.map((group) => group.directory);

describe("documentation content", () => {
  it("keeps every page inside a sidebar group", () => {
    const outside = sidebarPages.filter(
      (page) => !groupDirectories.includes(page.split(sep)[0] ?? ""),
    );

    expect(outside).toEqual([]);
  });

  it("publishes at least one page in every group", () => {
    const empty = groupDirectories.filter(
      (directory) => !sidebarPages.some((page) => page.startsWith(`${directory}${sep}`)),
    );

    expect(empty).toEqual([]);
  });

  it("never publishes a page without content", () => {
    const blank = pages.filter((page) => bodyOf(page).length === 0);

    expect(blank).toEqual([]);
  });
});
