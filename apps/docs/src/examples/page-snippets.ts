/**
 * The `<page>:<line>` of each piece of Dart code the `pages` (keyed by their
 * path) write themselves instead of taking from an example file: a ```dart
 * block, or a `<Code lang="dart">` whose `code` is not a snippet of a module
 * under `src/examples/`. Those modules read `// #region`s of the files under
 * `packages/sdk_flutter/example/`, which `dart analyze` checks, so a page
 * never shows Dart code that does not compile (US-139, US-150).
 */
export function dartSnippetsOutsideExamples(pages: Record<string, string>): string[] {
  return Object.entries(pages).flatMap(([page, source]) => {
    const lines = source.split(/\r?\n/);
    const exampleModules = new Set(
      [...source.matchAll(/^import\s*\{([^}]*)\}\s*from\s*["'][^"']*\/examples\/[^"']+["']/gm)]
        .flatMap(([, names]) => (names ?? "").split(","))
        .map((name) => name.trim())
        .filter(Boolean),
    );

    const fences = lines.flatMap((line, index) =>
      /^\s*(`{3,}|~{3,})\s*dart\b/i.test(line) ? [index + 1] : [],
    );
    const components = [...source.matchAll(/<Code\b[^>]*>/g)].flatMap(({ 0: tag, index }) => {
      if (!/\slang=\{?["']dart["']\}?/.test(tag)) return [];
      const code = /\scode=\{\s*(\w+)\.\w+\s*\}/.exec(tag)?.[1];
      if (code && exampleModules.has(code)) return [];
      return [source.slice(0, index).split("\n").length];
    });

    return [...fences, ...components]
      .sort((a, b) => a - b)
      .map((line) => `Fragmento Dart escrito en la página: ${page}:${line}`);
  });
}
