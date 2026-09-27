import { describe, expect, it } from "vitest";
import { configuration } from "./configuration";

describe("configuration example (US-140)", () => {
  it("configures production with HTTPS, the credential and a storage directory only", () => {
    expect(configuration.production).toContain("Uri.parse('https://");
    for (const parameter of ["serverUrl:", "credential:", "storageDirectory:"]) {
      expect(configuration.production).toContain(parameter);
    }
    expect(configuration.production).not.toContain("allowInsecureLoopback");
  });

  it("allows insecure HTTP only against the local server on localhost", () => {
    expect(configuration.localDevelopment).toContain("Uri.parse('http://localhost:3000')");
    expect(configuration.localDevelopment).toContain("allowInsecureLoopback: true");
  });

  it("keeps the credential out of the source code", () => {
    expect(Object.values(configuration).join("\n")).not.toContain("ayni_sk_");
  });
});
