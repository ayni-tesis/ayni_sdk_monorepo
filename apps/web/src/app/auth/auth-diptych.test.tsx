// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, signInEmailMock, toastMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  signInEmailMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ isPending: false }),
    signIn: { email: signInEmailMock },
    signUp: { email: vi.fn() },
  },
}));

import { AuthDiptych } from "./auth-diptych";

describe("AuthDiptych", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("switches to sign-up mode when clicking the register tab", () => {
    render(<AuthDiptych initialMode="sign-in" />);

    const signUpTab = screen.getByRole("tab", { name: /registrarse/i });
    fireEvent.click(signUpTab);

    expect(pushMock).toHaveBeenCalledWith("/sign-up");
  });

  it("renders the sign-up form after the privacy notice is published", () => {
    render(<AuthDiptych initialMode="sign-up" />);

    expect(screen.getByRole("heading", { name: /crea tu cuenta/i })).toBeTruthy();
    expect(screen.getByLabelText(/correo electrónico/i)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /términos y condiciones/i })).toBeTruthy();
  });

  it("switches to sign-in mode when clicking the sign-in tab from sign-up", () => {
    render(<AuthDiptych initialMode="sign-up" />);

    const signInTab = screen.getByRole("tab", { name: /iniciar sesión/i });
    fireEvent.click(signInTab);

    expect(pushMock).toHaveBeenCalledWith("/sign-in");
  });
});
