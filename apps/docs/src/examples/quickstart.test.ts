import { describe, expect, it } from "vitest";
import { quickstart } from "./quickstart";

describe("quick start example (US-139)", () => {
  it("keeps the credential out of the source code", () => {
    expect(quickstart.saveCredential).toContain("String.fromEnvironment('AYNI_CREDENTIAL')");
    expect(Object.values(quickstart).join("\n")).not.toContain("ayni_sk_");
  });

  it("creates the client with the server URL, the credential and the storage directory", () => {
    expect(quickstart.createClient).toContain("AyniSdk(");
    for (const parameter of ["serverUrl:", "credential:", "storageDirectory:"]) {
      expect(quickstart.createClient).toContain(parameter);
    }
  });

  it("synchronizes with sync()", () => {
    expect(quickstart.sync).toContain("await sdk.sync()");
  });

  it("shows one message for every SyncStatus", () => {
    // `dart format` may wrap a long case onto its own line.
    const checkResult = quickstart.checkResult.replace(/\s+/g, " ");
    expect(checkResult).toContain("switch (result.status)");
    for (const [status, message] of [
      ["updated", "Sincronización completada."],
      ["upToDate", "Ya estás al día."],
      ["offline", "Sin conexión."],
      ["error", "No se completó la sincronización. Revisa los recursos afectados."],
    ]) {
      expect(checkResult).toContain(`SyncStatus.${status} => '${message}'`);
    }
  });
});
