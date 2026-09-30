import { CURRENT_TERMS_VERSION, hasAcceptedCurrentTerms } from "@ayni/env/terms";
import { describe, expect, it } from "vitest";

describe("hasAcceptedCurrentTerms", () => {
  it("requires affirmative acceptance of the current version", () => {
    expect(hasAcceptedCurrentTerms(CURRENT_TERMS_VERSION)).toBe(true);
    expect(hasAcceptedCurrentTerms(undefined)).toBe(false);
    expect(hasAcceptedCurrentTerms("0.9.0")).toBe(false);
  });
});
