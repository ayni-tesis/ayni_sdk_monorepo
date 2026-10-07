import { describe, expect, it, vi } from "vitest";

const { isClaimedEmailVerificationTokenMock, storeEmailVerificationTokenMock } = vi.hoisted(() => ({
  isClaimedEmailVerificationTokenMock: vi.fn(),
  storeEmailVerificationTokenMock: vi.fn(),
}));

vi.mock("@ayni/db", () => ({ db: {} }));
vi.mock("@ayni/env/privacy-notice", () => ({
  AYNI_PRIVACY_NOTICE: { version: "1.0.1", status: "draft" },
}));
vi.mock("./verification", () => ({
  EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: 60 * 60,
  isClaimedEmailVerificationToken: isClaimedEmailVerificationTokenMock,
  storeEmailVerificationToken: storeEmailVerificationTokenMock,
}));
vi.hoisted(() => {
  process.env.DATABASE_URL = "postgres://localhost/test";
  process.env.BETTER_AUTH_SECRET = "test-secret-with-at-least-thirty-two-characters";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.UPSTASH_REDIS_REST_URL = "https://example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  process.env.CORS_ORIGIN = "http://localhost:3001";
  process.env.GITHUB_CLIENT_ID = "github-client-id";
  process.env.GITHUB_CLIENT_SECRET = "github-client-secret";
});

import { CURRENT_TERMS_VERSION } from "@ayni/env/terms";
import { auth } from "./index";

async function post(path: string, body: unknown) {
  return auth.handler(
    new Request(`http://localhost/api/auth${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("account authentication guards", () => {
  it("blocks email account creation while the Ayni privacy notice is a draft", async () => {
    const response = await post("/sign-up/email", {
      name: "Test User",
      email: "test@example.test",
      password: "password123",
      termsAcceptedVersion: CURRENT_TERMS_VERSION,
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      message:
        "El registro no está disponible mientras el aviso de privacidad de Ayni siga pendiente.",
    });
  });

  it.each([
    ["without", undefined],
    ["with an outdated", "1.0.0"],
    ["with an empty", ""],
  ])(
    "rejects an email sign-in %s current terms before checking credentials",
    async (_, version) => {
      const response = await post("/sign-in/email", {
        email: "test@example.test",
        password: "password123",
        termsAcceptedVersion: version,
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        message: "Debes aceptar los Términos y condiciones para iniciar sesión.",
      });
    },
  );

  it("requires current terms before starting GitHub OAuth", async () => {
    const response = await post("/sign-in/social", { provider: "github" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "Debes aceptar los Términos y condiciones para iniciar sesión.",
    });
  });

  it("rejects custom GitHub scopes that could request repository access", async () => {
    const response = await post("/sign-in/social", {
      provider: "github",
      scopes: ["repo"],
      additionalData: { termsAcceptedVersion: CURRENT_TERMS_VERSION },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "GitHub solo solicita acceso al perfil y al correo electrónico.",
    });
  });

  it.each(["", " ", "a"])(
    "rejects a profile name outside the accepted range (%j)",
    async (name) => {
      const response = await post("/update-user", { name });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        message: "El nombre debe tener entre 2 y 100 caracteres.",
      });
    },
  );

  it("rejects a profile name longer than the signup limit", async () => {
    const response = await post("/update-user", { name: "a".repeat(101) });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "El nombre debe tener entre 2 y 100 caracteres.",
    });
  });

  it("allows an account to sign in while email verification is pending", () => {
    expect(auth.options.emailAndPassword).toMatchObject({
      autoSignIn: true,
      requireEmailVerification: false,
    });
    expect(auth.options.emailVerification).toMatchObject({
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
    });
  });

  it("requires a claimed token associated with the Better Auth user", async () => {
    isClaimedEmailVerificationTokenMock.mockResolvedValue(false);
    const beforeEmailVerification = auth.options.emailVerification.beforeEmailVerification;
    const user = { id: "user-1" } as never;
    const request = new Request(
      "http://localhost/api/auth/verify-email?token=token&ayniClaimId=claim",
    );

    await expect(beforeEmailVerification?.(user, request)).rejects.toMatchObject({
      status: "BAD_REQUEST",
    });
    expect(isClaimedEmailVerificationTokenMock).toHaveBeenCalledWith("token", "claim", "user-1");
  });

  it("redirects invalid verification links to the error screen so another link can be requested", async () => {
    const callbackURL = "http://localhost:3001/verify-email?verified=1";
    const response = await auth.handler(
      new Request(
        `http://localhost/api/auth/verify-email?token=invalid&callbackURL=${encodeURIComponent(callbackURL)}`,
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3001/verify-email?verified=1&error=INVALID_TOKEN",
    );
  });

  it("redirects temporary verification failures to a retryable error state", async () => {
    isClaimedEmailVerificationTokenMock.mockRejectedValue(new Error("database unavailable"));
    const callbackURL = "http://localhost:3001/verify-email?verified=1";
    const response = await auth.handler(
      new Request(
        `http://localhost/api/auth/verify-email?token=token&ayniClaimId=claim&callbackURL=${encodeURIComponent(callbackURL)}`,
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3001/verify-email?verified=1&error=FAILED_TO_VERIFY",
    );
  });

  it("does not redirect invalid verification links to untrusted callback origins", async () => {
    const callbackURL = "https://attacker.example/collect";
    const response = await auth.handler(
      new Request(
        `http://localhost/api/auth/verify-email?token=invalid&callbackURL=${encodeURIComponent(callbackURL)}`,
      ),
    );

    expect(response.status).toBe(400);
    expect(response.headers.has("location")).toBe(false);
  });

  it("rejects a malformed verification callback URL", async () => {
    isClaimedEmailVerificationTokenMock.mockResolvedValue(false);
    const response = await auth.handler(
      new Request(
        "http://localhost/api/auth/verify-email?token=invalid&callbackURL=http%3A%2F%2F%5B",
      ),
    );

    expect(response.status).toBe(400);
    expect(response.headers.has("location")).toBe(false);
  });

  it("does not let the profile update route change terms acceptance", async () => {
    const response = await post("/update-user", {
      name: "Updated Name",
      termsAcceptedVersion: CURRENT_TERMS_VERSION,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "Solo puedes actualizar tu nombre desde este flujo.",
    });
  });
});
