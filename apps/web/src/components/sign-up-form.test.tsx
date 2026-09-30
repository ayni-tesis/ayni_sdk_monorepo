// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ isPending: false }), signUp: { email: vi.fn() } },
}));

import SignUpForm from "./sign-up-form";

describe("SignUpForm", () => {
  afterEach(cleanup);

  it("does not collect account data while Ayni's privacy notice is a draft", () => {
    render(<SignUpForm onSwitchToSignIn={vi.fn()} />);

    expect(screen.getByText("Registro temporalmente no disponible")).toBeTruthy();
    expect(screen.queryByLabelText("Correo electrónico")).toBeNull();
  });
});
