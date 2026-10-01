// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { privacyNoticeMock, pushMock, signInEmailMock, signUpEmailMock, toastMock } = vi.hoisted(
  () => ({
    privacyNoticeMock: { version: "1.0.1", status: "published" as "draft" | "published" },
    pushMock: vi.fn(),
    signInEmailMock: vi.fn(),
    signUpEmailMock: vi.fn(),
    toastMock: { success: vi.fn(), error: vi.fn() },
  }),
);

vi.mock("@ayni/env/privacy-notice", () => ({ AYNI_PRIVACY_NOTICE: privacyNoticeMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ isPending: false }),
    signIn: { email: signInEmailMock },
    signUp: { email: signUpEmailMock },
  },
}));

import { AuthDiptych } from "./auth-diptych";

describe("AuthDiptych", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    privacyNoticeMock.status = "published";
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
  });

  it("renders the sign-up form when the privacy notice is published", () => {
    render(<AuthDiptych initialMode="sign-up" />);

    expect(screen.getByRole("heading", { name: /crea tu cuenta/i })).toBeTruthy();
    expect(screen.getByLabelText(/correo electrónico/i)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /términos y condiciones/i })).toBeTruthy();
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

  it("shows fallback error when terms acceptance registration fails", async () => {
    signUpEmailMock.mockImplementation(
      async (
        _credentials: unknown,
        callbacks: { onError?: (ctx: { error?: { message?: string } }) => void },
      ) => {
        callbacks.onError?.({ error: undefined });
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
        screen.getByText("No pudimos registrar tu aceptación. Inténtalo nuevamente."),
      ).toBeTruthy();
    });
    expect(toastMock.error).toHaveBeenCalledWith(
      "No pudimos registrar tu aceptación. Inténtalo nuevamente.",
    );
  });
});
