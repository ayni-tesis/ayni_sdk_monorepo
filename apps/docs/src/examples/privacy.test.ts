import { describe, expect, it } from "vitest";
import { privacy } from "./privacy";

describe("privacy example (US-147)", () => {
  it("deletes the whole storage directory of the SDK", () => {
    expect(privacy.deleteData).toContain("sdk.storageDirectory");
    expect(privacy.deleteData).toContain(".delete(recursive: true)");
  });

  it("passes the consent for evidence collection and deletes the evidence (US-066)", () => {
    expect(privacy.captureEvidence).toContain("evidenceConsent:");
    expect(privacy.captureEvidence).toContain("onEvidence:");
    expect(privacy.deleteEvidence).toBe("await sdk.clearPendingEvidence();");
  });
});
