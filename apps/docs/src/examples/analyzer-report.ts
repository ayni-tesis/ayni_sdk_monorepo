/** What `analyzerFailures` reads besides the analyzer's output, keyed by path. */
export type AnalyzedSources = {
  /** The SDK package's directory, as the analyzer prints it. */
  packageRoot: string;
  /** The example files, keyed by their path in the package (`example/…`). */
  examples: Record<string, string>;
  /** The modules under `src/examples/` that read the examples' regions. */
  modules: Record<string, string>;
  /** The site's pages, keyed by their path under `src/content/docs/`. */
  pages: Record<string, string>;
};

type Issue = { severity: string; file: string; line: number; message: string };

/**
 * The errors and warnings of `dart analyze --format=machine` in the SDK
 * package, each with where the site shows the broken code: the page and line
 * of the `<Code>` that renders the region with the issue, the pages that
 * import an example whose issue is outside their regions, or the Dart
 * reference for its own examples. A renamed SDK symbol then names the page
 * that still uses it (US-150).
 */
export function analyzerFailures(output: string, sources: AnalyzedSources): string[] {
  const root = `${sources.packageRoot.replace(/\\/g, "/").replace(/\/$/, "")}/`;
  return output
    .split(/\r?\n/)
    .map((line) => parseIssue(line, root))
    .filter((issue): issue is Issue => issue !== undefined)
    .filter(({ severity }) => severity === "ERROR" || severity === "WARNING")
    .map(({ file, line, message }) => {
      const at = `${file}:${line}`;
      if (!file.startsWith("example/")) return `Error de análisis: ${message} en ${at}`;
      const shownIn = file.startsWith("example/reference/")
        ? ["la referencia de la API Dart"]
        : pagesShowing(file, line, sources);
      if (shownIn.length === 0) return `Ejemplo roto: ${message} en ${at}`;
      return `Ejemplo roto: ${message} en ${shownIn.join(", ")} (${at})`;
    });
}

/** `SEVERITY|TYPE|CODE|FILE|LINE|COLUMN|LENGTH|MESSAGE`, with `\` and `|` escaped. */
function parseIssue(text: string, root: string): Issue | undefined {
  const fields = text.split(/(?<!\\)\|/).map((field) => field.replace(/\\([\\|])/g, "$1"));
  if (fields.length < 8) return undefined;
  const [severity = "", , , path = "", line = ""] = fields;
  const file = path.replace(/\\/g, "/");
  return {
    severity,
    file: file.startsWith(root) ? file.slice(root.length) : file,
    line: Number(line),
    message: fields.slice(7).join("|"),
  };
}

/** The `<page>:<line>` locations that show line `line` of `example`. */
function pagesShowing(example: string, line: number, sources: AnalyzedSources): string[] {
  const exampleSource = sources.examples[example] ?? "";
  const regions = regionsAt(exampleSource, line);
  return Object.values(sources.modules).flatMap((module) => {
    const readsExample = [...module.matchAll(/from\s+["']([^"'?]+)\?raw["']/g)].some(([, path]) =>
      (path ?? "").endsWith(`/sdk_flutter/${example}`),
    );
    const name = /export const (\w+) =/.exec(module)?.[1];
    if (!readsExample || !name) return [];
    const snippets = [
      ...module.matchAll(/(\w+):\s*exampleRegion\(\s*\w+,\s*["']([^"']+)["']\s*\)/g),
    ].flatMap(([, key, region]) => (regions.includes(region ?? "") ? [key] : []));

    return Object.entries(sources.pages).flatMap(([page, text]) => {
      const lines = text.split(/\r?\n/);
      const imports = lines.findIndex((pageLine) =>
        new RegExp(`^import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*["'].*/examples/`).test(
          pageLine,
        ),
      );
      if (imports === -1) return [];
      const uses = lines.flatMap((pageLine, index) =>
        snippets.some((key) => new RegExp(`\\{\\s*${name}\\.${key}\\s*\\}`).test(pageLine))
          ? [index + 1]
          : [],
      );
      return (snippets.length > 0 ? uses : [imports + 1]).map((at) => `${page}:${at}`);
    });
  });
}

/** The names of the `// #region`s of `source` that contain line `line` (1-based). */
function regionsAt(source: string, line: number): string[] {
  const lines = source.split(/\r?\n/);
  return lines.flatMap((text, index) => {
    const name = /^\s*\/\/ #region (\S+)\s*$/.exec(text)?.[1];
    if (!name) return [];
    const end = lines.findIndex(
      (other, at) => at > index && other.trim() === `// #endregion ${name}`,
    );
    return index + 1 < line && (end === -1 || line < end + 1) ? [name] : [];
  });
}
