import { describe, expect, it } from "vitest";
import { redirectAfterEmailVerificationFailure, verificationSucceeded } from "./auth-verification";

describe("email verification failure redirect", () => {
  const callbackURL = "https://app.example.test/verify-email?verified=1";
  const origins = ["https://api.example.test", "https://app.example.test"];

  it("returns the user to the verification screen with a retryable server failure", () => {
    const request = new Request(
      `https://api.example.test/api/auth/verify-email?callbackURL=${encodeURIComponent(callbackURL)}`,
    );

    const response = redirectAfterEmailVerificationFailure(request, 500, origins);

    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toBe(
      "https://app.example.test/verify-email?verified=1&error=FAILED_TO_VERIFY",
    );
  });

  it("returns an invalid-link state for client errors", () => {
    const request = new Request(
      `https://api.example.test/api/auth/verify-email?callbackURL=${encodeURIComponent(callbackURL)}`,
    );

    const response = redirectAfterEmailVerificationFailure(request, 400, origins);

    expect(response?.headers.get("location")).toBe(
      "https://app.example.test/verify-email?verified=1&error=INVALID_TOKEN",
    );
  });

  it("recognizes successful and failed Better Auth redirects", () => {
    const request = new Request(
      `https://api.example.test/api/auth/verify-email?callbackURL=${encodeURIComponent(callbackURL)}`,
    );

    expect(verificationSucceeded(Response.redirect(callbackURL), request)).toBe(true);
    expect(verificationSucceeded(Response.redirect(callbackURL), request, false)).toBe(false);
    expect(
      verificationSucceeded(Response.redirect(`${callbackURL}&error=INVALID_TOKEN`), request),
    ).toBe(false);
    expect(verificationSucceeded(new Response(null, { status: 500 }), request)).toBe(false);
  });

  it("does not redirect an untrusted callback or an unrelated response", () => {
    const untrustedRequest = new Request(
      "https://api.example.test/api/auth/verify-email?callbackURL=https%3A%2F%2Fevil.example.test",
    );
    const malformedRequest = new Request(
      "https://api.example.test/api/auth/verify-email?callbackURL=http%3A%2F%2F%5B",
    );
    const otherRequest = new Request("https://api.example.test/api/auth/sign-in/email");

    expect(redirectAfterEmailVerificationFailure(untrustedRequest, 500, origins)).toBeNull();
    expect(redirectAfterEmailVerificationFailure(malformedRequest, 500, origins)).toBeNull();
    expect(redirectAfterEmailVerificationFailure(otherRequest, 500, origins)).toBeNull();
    expect(redirectAfterEmailVerificationFailure(untrustedRequest, 400, origins)).toBeNull();
  });
});
