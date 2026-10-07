// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requestPasswordResetMock, resetPasswordMock } = vi.hoisted(() => ({
  requestPasswordResetMock: vi.fn(),
  resetPasswordMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: requestPasswordResetMock,
    resetPassword: resetPasswordMock,
  },
}));

import { ForgotPasswordForm, ResetPasswordForm, VerifyEmailStatus } from "./recovery-forms";

describe("account recovery forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestPasswordResetMock.mockResolvedValue({ error: null });
    resetPasswordMock.mockResolvedValue({ error: null });
  });

  afterEach(cleanup);

  it("returns the same generic response after requesting a password reset", async () => {
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "person@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar instrucciones" }));

    expect((await screen.findByRole("status")).textContent).toContain(
      "Si existe una cuenta con ese correo, recibirás instrucciones para recuperar el acceso.",
    );
    expect(requestPasswordResetMock).toHaveBeenCalledWith({
      email: "person@example.test",
      redirectTo: `${window.location.origin}/reset-password`,
    });
  });

  it("validates an email before requesting password reset", async () => {
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar instrucciones" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Ingresa un correo electrónico válido.",
    );
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });

  it("updates the password using the token and confirms only after success", async () => {
    render(<ResetPasswordForm token="one-use-token" />);
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar contraseña" }));

    await waitFor(() =>
      expect(resetPasswordMock).toHaveBeenCalledWith({
        newPassword: "new-password",
        token: "one-use-token",
      }),
    );
    expect((await screen.findByRole("status")).textContent).toContain(
      "Contraseña actualizada. Ya puedes iniciar sesión.",
    );
  });

  it("lets the person request another link when the reset token is invalid", async () => {
    resetPasswordMock.mockResolvedValue({
      error: { code: "INVALID_TOKEN", message: "token expired" },
    });
    render(<ResetPasswordForm token="expired-token" />);
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar contraseña" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Este enlace ya no es válido. Solicita recuperar tu contraseña nuevamente.",
    );
    expect(screen.getByRole("link", { name: "Solicitar otro enlace" })).toBeTruthy();
  });

  it("keeps a valid reset form available when the new password fails policy validation", async () => {
    resetPasswordMock.mockResolvedValue({
      error: { code: "PASSWORD_TOO_SHORT", message: "Password is too short" },
    });
    render(<ResetPasswordForm token="valid-token" />);
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar contraseña" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "La contraseña debe tener al menos 8 caracteres.",
    );
    expect(screen.getByLabelText("Nueva contraseña")).toBeTruthy();
  });

  it("shows an invalid-link state when no reset token is present", () => {
    render(<ResetPasswordForm />);

    expect(screen.getByRole("alert").textContent).toContain(
      "Este enlace ya no es válido. Solicita recuperar tu contraseña nuevamente.",
    );
    expect(screen.getByRole("link", { name: "Solicitar otro enlace" })).toBeTruthy();
  });

  it("reports email verification success or an invalid link", () => {
    const { rerender } = render(<VerifyEmailStatus />);
    expect(screen.getByRole("status").textContent).toContain("Correo verificado.");

    rerender(<VerifyEmailStatus error="INVALID_TOKEN" />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Este enlace ya no es válido. Solicita uno nuevo para verificar tu correo.",
    );
  });
});
