// `bun run verify` (apps/docs): every check of CI's `Verificar documentación`
// step in one command (US-150). It needs Flutter 3.44.8 for the Dart checks.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzerFailures } from "../examples/analyzer-report";
import { externalLinks, unreachableLinks } from "../links/external-links";
import { type Check, runChecks } from "./checks";

const repository = join(import.meta.dirname, "..", "..", "..", "..");
const docs = join(repository, "apps", "docs");
const sdk = join(repository, "packages", "sdk_flutter");
const api = join(repository, "packages", "api");
const contentDir = join(docs, "src", "content", "docs");

/** How many lines of a failed command's output a problem quotes. */
const quotedLines = 40;

/** Runs `program` in `cwd`; `output` joins its stdout and stderr. */
function execute(cwd: string, program: string, args: string[]) {
  // On Windows `dart` is a `.bat` file, which only a shell can run.
  const shell = process.platform === "win32" && program === "dart";
  const options = { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 } as const;
  const result = shell
    ? spawnSync([program, ...args].join(" "), { ...options, shell: true })
    : spawnSync(program, args, options);
  if (result.error) throw new Error(`${program} ${args.join(" ")}: ${result.error.message}`);
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** The problem of a failed command: the end of its output. */
function failure(command: string, output: string): string[] {
  const lines = output.trimEnd().split(/\r?\n/).slice(-quotedLines);
  return [`${command} falló:`, ...lines.map((line) => `    ${line}`)];
}

/** The files under `directory` that `filter` accepts, keyed by their path from `directory`. */
function readTree(directory: string, filter: (file: string) => boolean): Record<string, string> {
  return Object.fromEntries(
    readdirSync(directory, { recursive: true, encoding: "utf8" })
      .map((file) => file.replace(/\\/g, "/"))
      .filter(filter)
      .map((file) => [file, readFileSync(join(directory, file), "utf8")]),
  );
}

const pages = () => readTree(contentDir, (file) => /\.mdx?$/.test(file));

const checks: Check[] = [
  {
    name: "Ejemplos Dart analizados (dart analyze)",
    blocking: true,
    run: async () => {
      const dependencies = execute(sdk, "dart", ["pub", "get"]);
      if (!dependencies.ok) return failure("dart pub get", dependencies.output);
      const analysis = execute(sdk, "dart", ["analyze", "--format=machine", "example"]);
      if (analysis.ok) return [];
      const problems = analyzerFailures(analysis.output, {
        packageRoot: sdk,
        examples: Object.fromEntries(
          Object.entries(readTree(join(sdk, "example"), (file) => file.endsWith(".dart"))).map(
            ([file, source]) => [`example/${file}`, source],
          ),
        ),
        modules: readTree(
          join(docs, "src", "examples"),
          (file) => /^[\w-]+\.ts$/.test(file) && !file.endsWith(".test.ts"),
        ),
        pages: pages(),
      });
      return problems.length > 0 ? problems : failure("dart analyze", analysis.output);
    },
  },
  {
    name: "Ejemplos de la API Dart y workflow JSON (dart test)",
    blocking: true,
    run: async () => {
      const tests = ["test/doc_examples_test.dart", "test/workflow_schema_example_test.dart"];
      const result = execute(sdk, "dart", ["test", ...tests]);
      return result.ok ? [] : failure(`dart test ${tests.join(" ")}`, result.output);
    },
  },
  {
    name: "Contratos citados en las páginas (vitest)",
    blocking: true,
    run: async () => {
      const result = execute(docs, process.execPath, ["run", "test"]);
      return result.ok ? [] : failure("bun run test", result.output);
    },
  },
  {
    name: "Especificación OpenAPI al día (openapi:verify)",
    blocking: true,
    run: async () => {
      const result = execute(api, process.execPath, ["run", "openapi:verify"]);
      return result.ok ? [] : failure("bun run openapi:verify", result.output);
    },
  },
  {
    name: "Sitio compilado, enlaces internos y anclas (astro build)",
    blocking: true,
    run: async () => {
      const result = execute(docs, process.execPath, ["run", "build"]);
      if (result.ok) return [];
      const brokenLinks = result.output
        .split(/\r?\n/)
        .filter((line) => line.startsWith("Enlace roto:"));
      return brokenLinks.length > 0 ? brokenLinks : failure("bun run build", result.output);
    },
  },
  {
    name: "Enlaces externos",
    blocking: false,
    run: () => unreachableLinks(externalLinks(pages())),
  },
];

const passed = await runChecks(checks, {
  log: (line) => console.log(line),
  annotate: process.env.GITHUB_ACTIONS === "true",
});
process.exit(passed ? 0 : 1);
