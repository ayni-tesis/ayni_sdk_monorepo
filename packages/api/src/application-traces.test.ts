import { describe, expect, it } from "vitest";
import { applicationTracePageQuerySchema } from "./application-traces";

describe("applicationTracePageQuerySchema", () => {
  it("defaults to the first page", () => {
    expect(applicationTracePageQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it("accepts a bounded limit and opaque base64url cursor", () => {
    expect(
      applicationTracePageQuerySchema.parse({ limit: "25", cursor: "eyJyZWNlaXZlZEF0IjoifQ" }),
    ).toEqual({ limit: 25, cursor: "eyJyZWNlaXZlZEF0IjoifQ" });
  });

  it.each(["0", "101", "1.5", "NaN"])("rejects invalid page size %s", (limit) => {
    expect(applicationTracePageQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it("rejects malformed cursors and unexpected query parameters", () => {
    expect(applicationTracePageQuerySchema.safeParse({ cursor: "not+base64" }).success).toBe(false);
    expect(applicationTracePageQuerySchema.safeParse({ page: "2" }).success).toBe(false);
  });
});
