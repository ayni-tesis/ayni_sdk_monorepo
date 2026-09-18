// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  },
}));

import SignInForm from "./sign-in-form";

async function submitForm() {
  fireEvent.change(screen.getByLabelText("Correo electrónico"), {
    target: { value: "diego@biotec.io" },
  });
  fireEvent.change(screen.getByLabelText("Contraseña"), {
    target: { value: "secret1234" },
  });
  fireEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));
  await waitFor(() => expect(signInEmailMock).toHaveBeenCalled());
}

describe("SignInForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInEmailMock.mockImplementation(
      async (_credentials: unknown, callbacks: { onSuccess?: () => void }) => {
        callbacks.onSuccess?.();
      },
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("redirects to the next parameter after signing in", async () => {
    window.history.replaceState({}, "", "/login?next=%2Fjoin%3Ftoken%3Dtok-1");
    render(<SignInForm onSwitchToSignUp={vi.fn()} />);
    await submitForm();
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/join?token=tok-1"));
  });

  it("redirects to the dashboard when there is no next parameter", async () => {
    window.history.replaceState({}, "", "/login");
    render(<SignInForm onSwitchToSignUp={vi.fn()} />);
    await submitForm();
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("ignores external next targets", async () => {
    window.history.replaceState({}, "", "/login?next=%2F%2Fevil.com");
    render(<SignInForm onSwitchToSignUp={vi.fn()} />);
    await submitForm();
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
  });
});
