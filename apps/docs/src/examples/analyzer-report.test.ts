import { describe, expect, it } from "vitest";
import { analyzerFailures } from "./analyzer-report";

const packageRoot = "C:\\repo\\packages\\sdk_flutter";

const examples = {
  "example/quickstart.dart": [
    "import 'package:ayni_sdk/ayni_sdk.dart';",
    "",
    "Future<void> main() async {",
    "  // #region crear-cliente",
    "  final sdk = AyniSdk.instance;",
    "  // #endregion crear-cliente",
    "  // #region sincronizar",
    "  await sdk.sincronizar();",
    "  // #endregion sincronizar",
    "}",
  ].join("\n"),
};

const modules = {
  "quickstart.ts": [
    'import source from "../../../../packages/sdk_flutter/example/quickstart.dart?raw";',
    'import { exampleRegion } from "./region";',
    "",
    "export const quickstart = {",
    '  createClient: exampleRegion(source, "crear-cliente"),',
    '  sync: exampleRegion(source, "sincronizar"),',
    "};",
  ].join("\n"),
};

const pages = {
  "comenzar/inicio-rapido.mdx": [
    'import { Code } from "@astrojs/starlight/components";',
    'import { quickstart } from "../../../examples/quickstart";',
    "",
    "## 3. Sincroniza",
    "",
    '<Code code={quickstart.sync} lang="dart" />',
  ].join("\n"),
  "guias/otra.mdx": 'import { quickstart } from "../../../examples/quickstart";\n',
};

/** One line of `dart analyze --format=machine`, which escapes `\` and `|`. */
function issue(severity: string, file: string, line: number, message: string): string {
  const path = `${packageRoot}\\${file.replace(/\//g, "\\")}`.replace(/\\/g, "\\\\");
  return [severity, "COMPILE_TIME_ERROR", "UNDEFINED_METHOD", path, line, 13, 11, message].join(
    "|",
  );
}

const sources = { packageRoot, examples, modules, pages };

describe("analyzerFailures", () => {
  it("names the page and line that show a region using a symbol that no longer exists", () => {
    const output = issue(
      "ERROR",
      "example/quickstart.dart",
      8,
      "The method 'sincronizar' isn't defined for the type 'AyniSdk'.",
    );

    expect(analyzerFailures(output, sources)).toEqual([
      "Ejemplo roto: The method 'sincronizar' isn't defined for the type 'AyniSdk'. en comenzar/inicio-rapido.mdx:6 (example/quickstart.dart:8)",
    ]);
  });

  it("names the pages that import an example whose broken line is outside their regions", () => {
    const output = issue("ERROR", "example/quickstart.dart", 1, "Target of URI doesn't exist.");

    expect(analyzerFailures(output, sources)).toEqual([
      "Ejemplo roto: Target of URI doesn't exist. en comenzar/inicio-rapido.mdx:2, guias/otra.mdx:1 (example/quickstart.dart:1)",
    ]);
  });

  it("names the Dart reference for its examples and the file for any other issue", () => {
    const output = [
      issue("WARNING", "example/reference/sync.dart", 14, "Unused import."),
      issue("ERROR", "lib/src/ayni_sdk.dart", 3, "Missing documentation for a public member."),
      issue("INFO", "lib/src/ayni_sdk.dart", 9, "Prefer const."),
    ].join("\n");

    expect(analyzerFailures(output, sources)).toEqual([
      "Ejemplo roto: Unused import. en la referencia de la API Dart (example/reference/sync.dart:14)",
      "Error de análisis: Missing documentation for a public member. en lib/src/ayni_sdk.dart:3",
    ]);
  });

  it("keeps a | the analyzer escapes in the message", () => {
    const output = issue("ERROR", "lib/a.dart", 2, "Expected 'a\\|b'.");

    expect(analyzerFailures(output, sources)).toEqual([
      "Error de análisis: Expected 'a|b'. en lib/a.dart:2",
    ]);
  });
});
