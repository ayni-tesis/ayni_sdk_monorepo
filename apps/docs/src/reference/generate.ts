/**
 * Regenerates the SDK's Dart reference (US-143) in `public/referencia/api-dart`:
 * runs `dart doc` on `packages/sdk_flutter` (which needs the Flutter SDK and a
 * prior `dart pub get` there) and adapts each page with
 * `prepareReferencePage`. Vercel has no Dart, so the output is committed; CI
 * regenerates it and fails when the committed copy differs (ADR 0002).
 *
 * Run `bun run reference:dart` from `apps/docs` after changing the SDK's
 * public API or its `///` comments.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { prepareReferencePage, sdkVersion } from "./dart-reference";

const sdkDirectory = join(import.meta.dirname, "../../../../packages/sdk_flutter");
const dartDocOutput = join(sdkDirectory, "doc", "api");
const siteOutput = join(import.meta.dirname, "../../public/referencia/api-dart");
const packageName = "ayni_sdk";
const skippedFiles = [
  // `dart doc`'s own 404 page: the site serves Starlight's.
  "__404error.html",
  // A redirect from the library's old URL, which this site never published.
  `${packageName}/${packageName}-library.html`,
];
/** `dart doc`'s search results page has no content of its own to index. */
const unsearchableFiles = ["search.html"];

rmSync(dartDocOutput, { recursive: true, force: true });
const dartDoc = spawnSync("dart", ["doc"], {
  cwd: sdkDirectory,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (dartDoc.status !== 0) process.exit(dartDoc.status ?? 1);

const version = sdkVersion(readFileSync(join(sdkDirectory, "pubspec.yaml"), "utf8"));
rmSync(siteOutput, { recursive: true, force: true });
for (const file of listFiles(dartDocOutput)) {
  if (skippedFiles.includes(file)) continue;
  const target = join(siteOutput, file);
  mkdirSync(dirname(target), { recursive: true });
  if (!file.endsWith(".html")) {
    cpSync(join(dartDocOutput, file), target);
    continue;
  }
  const html = readFileSync(join(dartDocOutput, file), "utf8");
  const searchable = !unsearchableFiles.includes(file);
  writeFileSync(target, prepareReferencePage(html, { packageName, version, searchable }));
}
console.log(`Dart reference for ${packageName} ${version} written to ${siteOutput}.`);

/** Every file under `directory`, as a `/`-separated path relative to it. */
function listFiles(directory: string, root = directory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? listFiles(path, root)
      : [relative(root, path).split(sep).join("/")];
  });
}
