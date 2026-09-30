import { describe, expect, it } from "vitest";
import {
  createPrivacyRightsRequestSchema,
  updatePrivacyRightsRequestSchema,
} from "./privacy-rights-request";

describe("privacy rights request schemas", () => {
  it("accepts a minimal request and defaults optional details", () => {
    expect(
      createPrivacyRightsRequestSchema.parse({
        treatmentId: "550e8400-e29b-41d4-a716-446655440000",
        type: "access",
        contactEmail: "person@example.test",
      }),
    ).toMatchObject({ type: "access", details: "" });
  });

  it("rejects extra data and oversized request details", () => {
    expect(
      createPrivacyRightsRequestSchema.safeParse({
        treatmentId: "550e8400-e29b-41d4-a716-446655440000",
        type: "access",
        contactEmail: "person@example.test",
        nationalId: "not accepted",
      }).success,
    ).toBe(false);
    expect(
      createPrivacyRightsRequestSchema.safeParse({
        treatmentId: "550e8400-e29b-41d4-a716-446655440000",
        type: "access",
        contactEmail: "person@example.test",
        details: "x".repeat(2001),
      }).success,
    ).toBe(false);
  });

  it("requires a response or a reason for resolved states", () => {
    expect(updatePrivacyRightsRequestSchema.safeParse({ status: "answered" }).success).toBe(false);
    expect(
      updatePrivacyRightsRequestSchema.safeParse({
        status: "answered",
        response: "Respondimos por el canal indicado.",
      }).success,
    ).toBe(true);
    expect(
      updatePrivacyRightsRequestSchema.safeParse({
        status: "notApplicable",
        reason: "No procede; puedes reclamar ante el canal publicado.",
      }).success,
    ).toBe(true);
  });
});
