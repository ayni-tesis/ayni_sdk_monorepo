// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  privacyNoticeMock,
  webEnvMock,
  pushMock,
  signInEmailMock,
  signInSocialMock,
  signUpEmailMock,
  toastMock,
} = vi.hoisted(() => ({
  privacyNoticeMock: { version: "1.0.1", status: "published" as "draft" | "published" },
  webEnvMock: { NEXT_PUBLIC_GITHUB_AUTH_ENABLED: true },
  pushMock: vi.fn(),
  signInEmailMock: vi.fn(),
  signInSocialMock: vi.fn(),
  signUpEmailMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@ayni/env/privacy-notice", () => ({ AYNI_PRIVACY_NOTICE: privacyNoticeMock }));
vi.mock("@ayni/env/web", () => ({ env: webEnvMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ isPending: false }),
    signIn: { email: signInEmailMock, social: signInSocialMock },
    signUp: { email: signUpEmailMock },
  },
}));

import { CURRENT_TERMS_VERSION } from "@ayni/env/terms";
import { AuthDiptych } from "./auth-diptych";

describe("AuthDiptych", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    privacyNoticeMock.status = "published";
    webEnvMock.NEXT_PUBLIC_GITHUB_AUTH_ENABLED = true;
    window.history.replaceState({}, "", "/");
    signInSocialMock.mockResolvedValue({ error: null });
    signUpEmailMock.mockImplementation(
      async (_credentials: unknown, callbacks: { onSuccess?: () => void }) => {
        callbacks.onSuccess?.();
      },
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("renders in sign-in mode with monolithic console and sign-in form", () => {
    render(<AuthDiptych initialMode="sign-in" />);

    expect(screen.getByRole("heading", { name: /inicia sesión/i })).toBeTruthy();
    expect(screen.getByLabelText(/correo electrónico/i)).toBeTruthy();
    expect(screen.getByLabelText(/contraseña/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /iniciar sesión/i })).toBeTruthy();
  });

  it("shows auth navigation links and marks the active route", () => {
    render(<AuthDiptych initialMode="sign-in" />);

    const nav = within(screen.getByRole("navigation", { name: "Acceso" }));
    const signUpLink = nav.getByRole("link", { name: "Registrarse" });
    expect(signUpLink.getAttribute("href")).toBe("/sign-up");
    expect(nav.getByRole("link", { name: "Iniciar sesión" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("shows the unavailable state when the privacy notice is a draft", () => {
    privacyNoticeMock.status = "draft";
    render(<AuthDiptych initialMode="sign-up" />);

    expect(screen.getByText(/registro temporalmente no disponible/i)).toBeTruthy();
    expect(screen.queryByLabelText(/correo electrónico/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Continuar con GitHub" })).toBeNull();
  });

  it("hides GitHub sign-in when the provider is not enabled", () => {
    webEnvMock.NEXT_PUBLIC_GITHUB_AUTH_ENABLED = false;
    render(<AuthDiptych initialMode="sign-in" />);

    expect(screen.queryByRole("button", { name: "Continuar con GitHub" })).toBeNull();
  });

  it("renders the sign-up form when the privacy notice is published", () => {
    render(<AuthDiptych initialMode="sign-up" />);

    expect(screen.getByRole("heading", { name: /crea tu cuenta/i })).toBeTruthy();
    expect(screen.getByLabelText(/correo electrónico/i)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /términos y condiciones/i })).toBeTruthy();
  });

  it("requires accepting the terms before signing in", async () => {
    render(<AuthDiptych initialMode="sign-in" />);

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: "test@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(
      await screen.findByText("Debes aceptar los Términos y condiciones para iniciar sesión."),
    ).toBeTruthy();
    expect(signInEmailMock).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("shows a generic sign-in error without exposing account details", async () => {
    signInEmailMock.mockImplementation(
      async (_credentials: unknown, callbacks: { onError?: () => void }) => {
        callbacks.onError?.();
      },
    );
    render(<AuthDiptych initialMode="sign-in" />);
    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: "test@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /términos y condiciones/i }));
    fireEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "No pudimos iniciar sesión. Revisa tu correo y contraseña e inténtalo de nuevo.",
    );
  });

  it("sends the current terms version and continues to the invitation after signing in", async () => {
    const next = "/join?token=tok-1";
    window.history.replaceState({}, "", `/sign-in?next=${encodeURIComponent(next)}`);
    signInEmailMock.mockImplementation(
      async (_credentials: unknown, callbacks: { onSuccess?: () => void }) => {
        callbacks.onSuccess?.();
      },
    );
    render(<AuthDiptych initialMode="sign-in" next={next} />);

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: "test@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /términos y condiciones/i }));
    fireEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(next));
    expect(signInEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ termsAcceptedVersion: CURRENT_TERMS_VERSION }),
      expect.anything(),
    );
  });

  it("preserves an invitation through sign-in, sign-up, and successful registration", async () => {
    const next = "/join?token=tok-1";
    window.history.replaceState({}, "", `/sign-in?next=${encodeURIComponent(next)}`);
    const { unmount } = render(<AuthDiptych initialMode="sign-in" next={next} />);

    const signUpHref = within(screen.getByRole("navigation", { name: "Acceso" }))
      .getByRole("link", { name: "Registrarse" })
      .getAttribute("href");
    expect(signUpHref).toBe(`/sign-up?next=${encodeURIComponent(next)}`);
    unmount();

    window.history.replaceState({}, "", signUpHref);
    render(<AuthDiptych initialMode="sign-up" next={next} />);

    expect(
      within(screen.getByRole("navigation", { name: "Acceso" }))
        .getByRole("link", { name: "Iniciar sesión" })
        .getAttribute("href"),
    ).toBe(`/sign-in?next=${encodeURIComponent(next)}`);
    fireEvent.change(screen.getByLabelText("Nombre completo"), {
      target: { value: "Test User" },
    });
    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: "test@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(next));
  });

  it("shows helpful error message when email is already registered", async () => {
    signUpEmailMock.mockImplementation(
      async (
        _credentials: unknown,
        callbacks: { onError?: (ctx: { error: { code: string; message: string } }) => void },
      ) => {
        callbacks.onError?.({
          error: {
            code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
            message: "User already exists. Use another email.",
          },
        });
      },
    );

    render(<AuthDiptych initialMode="sign-up" />);
    fireEvent.change(screen.getByLabelText("Nombre completo"), {
      target: { value: "Test User" },
    });
    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: "test@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Ya existe una cuenta con este correo electrónico. Inicia sesión en su lugar.",
        ),
      ).toBeTruthy();
    });
    expect(toastMock.error).toHaveBeenCalledWith(
      "Ya existe una cuenta con este correo electrónico. Inicia sesión en su lugar.",
    );
  });

  it("uses the current terms when continuing with GitHub and preserves the post-auth destination", async () => {
    const next = "/join?token=github-invite";
    window.history.replaceState({}, "", `/sign-in?next=${encodeURIComponent(next)}`);
    render(<AuthDiptych initialMode="sign-in" next={next} />);

    fireEvent.click(screen.getByRole("checkbox", { name: /términos y condiciones/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar con GitHub" }));

    await waitFor(() => expect(signInSocialMock).toHaveBeenCalledTimes(1));
    expect(signInSocialMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "github",
        callbackURL: next,
        additionalData: { termsAcceptedVersion: CURRENT_TERMS_VERSION },
        errorCallbackURL: expect.stringContaining("github=error"),
      }),
    );
  });

  it("requires current terms before starting GitHub authorization", async () => {
    render(<AuthDiptych initialMode="sign-in" />);

    fireEvent.click(screen.getByRole("button", { name: "Continuar con GitHub" }));

    expect(
      await screen.findByText(
        "Debes aceptar los Términos y condiciones vigentes para continuar con GitHub.",
      ),
    ).toBeTruthy();
    expect(signInSocialMock).not.toHaveBeenCalled();
  });

  it("offers GitHub during registration and includes accepted current terms", async () => {
    render(<AuthDiptych initialMode="sign-up" />);
    fireEvent.click(screen.getByRole("checkbox", { name: /términos y condiciones/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar con GitHub" }));

    await waitFor(() => expect(signInSocialMock).toHaveBeenCalledTimes(1));
    expect(signInSocialMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "github",
        callbackURL: "/dashboard",
        additionalData: { termsAcceptedVersion: CURRENT_TERMS_VERSION },
      }),
    );
  });

  it("returns a verified signup link to the confirmation screen", async () => {
    render(<AuthDiptych initialMode="sign-up" />);
    fireEvent.change(screen.getByLabelText("Nombre completo"), {
      target: { value: "Test User" },
    });
    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: "test@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    await waitFor(() => expect(signUpEmailMock).toHaveBeenCalledTimes(1));
    expect(signUpEmailMock.mock.calls[0]?.[0]).toMatchObject({
      callbackURL: `${window.location.origin}/verify-email?verified=1`,
    });
  });

  it("does not expose provider error details", async () => {
    signInSocialMock.mockRejectedValue(new Error("provider response contained private details"));
    render(<AuthDiptych initialMode="sign-in" />);
    fireEvent.click(screen.getByRole("checkbox", { name: /términos y condiciones/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar con GitHub" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "No pudimos completar el acceso con GitHub. Inténtalo nuevamente o usa correo y contraseña.",
    );
    expect(screen.queryByText(/private details/i)).toBeNull();
  });

  it("explains when GitHub did not return a confirmed email", () => {
    window.history.replaceState({}, "", "/sign-in?github=error&error=email_not_found");
    render(<AuthDiptych initialMode="sign-in" />);

    expect(screen.getByRole("alert").textContent).toContain(
      "GitHub no proporcionó un correo confirmado.",
    );
  });

  it("shows a generic registration error without exposing server details", async () => {
    signUpEmailMock.mockImplementation(
      async (
        _credentials: unknown,
        callbacks: { onError?: (ctx: { error?: { message?: string } }) => void },
      ) => {
        callbacks.onError?.({ error: { message: "internal auth details" } });
      },
    );

    render(<AuthDiptych initialMode="sign-up" />);
    fireEvent.change(screen.getByLabelText("Nombre completo"), {
      target: { value: "Test User" },
    });
    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: "test@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(screen.getByText("No pudimos crear tu cuenta. Inténtalo nuevamente.")).toBeTruthy();
    });
    expect(toastMock.error).toHaveBeenCalledWith(
      "No pudimos crear tu cuenta. Inténtalo nuevamente.",
    );
    expect(screen.queryByText(/internal auth details/i)).toBeNull();
  });
});
