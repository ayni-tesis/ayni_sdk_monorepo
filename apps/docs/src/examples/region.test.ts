import { describe, expect, it } from "vitest";
import { exampleRegion } from "./region";

const source = [
  "import 'package:ayni_sdk/ayni_sdk.dart';",
  "",
  "Future<void> syncAyni() async {",
  "  // #region sincronizar",
  "  final result = await sdk.sync();",
  "  if (result.status == SyncStatus.updated) {",
  "    print('ok');",
  "  }",
  "  // #endregion sincronizar",
  "}",
].join("\n");

describe("exampleRegion", () => {
  it("returns the lines between the region markers without their shared indentation", () => {
    expect(exampleRegion(source, "sincronizar")).toBe(
      [
        "final result = await sdk.sync();",
        "if (result.status == SyncStatus.updated) {",
        "  print('ok');",
        "}",
      ].join("\n"),
    );
  });

  it("drops the blank lines dart format leaves around a region", () => {
    const padded = "// #region resultado\n\nString message() => 'ok';\n\n// #endregion resultado";

    expect(exampleRegion(padded, "resultado")).toBe("String message() => 'ok';");
  });

  it("fails when the example has no region with that name", () => {
    expect(() => exampleRegion(source, "ejecutar")).toThrow(
      'The example has no "ejecutar" region.',
    );
  });

  it("fails when a region name is used twice, so a page cannot show the wrong block", () => {
    const twice = `${source}\n// #region sincronizar\nother();\n// #endregion sincronizar`;

    expect(() => exampleRegion(twice, "sincronizar")).toThrow(
      'The example repeats the "sincronizar" region.',
    );
  });

  it("fails when a region has no code", () => {
    const empty = "// #region vacia\n\n// #endregion vacia";

    expect(() => exampleRegion(empty, "vacia")).toThrow('The example\'s "vacia" region is empty.');
  });
});
