import { describe, expect, it } from "vitest";
import { privacy } from "./privacy";

describe("privacy example (US-147)", () => {
  it("deletes the whole storage directory of the SDK", () => {
    expect(privacy.deleteData).toContain("sdk.storageDirectory");
    expect(privacy.deleteData).toContain(".delete(recursive: true)");
  });
});
