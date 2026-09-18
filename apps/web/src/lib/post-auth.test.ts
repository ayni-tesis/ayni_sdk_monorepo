import { describe, expect, it } from "vitest";
import { DEFAULT_POST_AUTH_PATH, getSafePostAuthRedirect, joinLoginRedirect } from "./post-auth";

describe("getSafePostAuthRedirect", () => {
  it("returns the encoded next path when it is a same-origin route", () => {
    expect(getSafePostAuthRedirect("?next=%2Fjoin%3Ftoken%3Dtok-1")).toBe("/join?token=tok-1");
  });

  it("falls back to the dashboard when there is no next parameter", () => {
    expect(getSafePostAuthRedirect("")).toBe(DEFAULT_POST_AUTH_PATH);
    expect(getSafePostAuthRedirect("?other=1")).toBe(DEFAULT_POST_AUTH_PATH);
  });

  it("rejects protocol-relative and absolute redirect targets", () => {
    expect(getSafePostAuthRedirect("?next=%2F%2Fevil.com")).toBe(DEFAULT_POST_AUTH_PATH);
    expect(getSafePostAuthRedirect("?next=https%3A%2F%2Fevil.com")).toBe(DEFAULT_POST_AUTH_PATH);
    expect(getSafePostAuthRedirect("?next=%2F%5Cevil.com")).toBe(DEFAULT_POST_AUTH_PATH);
  });
});

describe("joinLoginRedirect", () => {
  it("preserves the invitation token through the login redirect", () => {
    expect(joinLoginRedirect("tok-1")).toBe("/login?next=%2Fjoin%3Ftoken%3Dtok-1");
  });

  it("points back to the join page when the token is missing", () => {
    expect(joinLoginRedirect(undefined)).toBe("/login?next=%2Fjoin");
  });
});
