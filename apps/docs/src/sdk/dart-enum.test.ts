import { describe, expect, it } from "vitest";
import ayniSdkSource from "../../../../packages/sdk_flutter/lib/src/ayni_sdk.dart?raw";
import { dartEnumValues } from "./dart-enum";

describe("dartEnumValues", () => {
  it("reads the values in declaration order, skipping doc comments", () => {
    const source = [
      "/// The outcome.",
      "enum Outcome {",
      "  /// It worked.",
      "  ///",
      "  /// Also when [other] happened.",
      "  worked,",
      "",
      "  // An internal note.",
      "  failed,",
      "}",
    ].join("\n");

    expect(dartEnumValues(source, "Outcome")).toEqual(["worked", "failed"]);
  });

  it("reads only the named enum when the source declares several", () => {
    const source = "enum First {\n  a,\n  b,\n}\n\nenum Second {\n  c,\n}\n";

    expect(dartEnumValues(source, "Second")).toEqual(["c"]);
  });

  it("fails when the source has no such enum", () => {
    expect(() => dartEnumValues("enum Other {\n  a,\n}\n", "Missing")).toThrow(
      "The source has no Missing enum.",
    );
  });

  it("reads SyncStatus from the SDK", () => {
    expect(dartEnumValues(ayniSdkSource, "SyncStatus")).toEqual([
      "updated",
      "upToDate",
      "offline",
      "error",
    ]);
  });
});
