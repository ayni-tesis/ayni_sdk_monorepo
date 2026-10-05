// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { client, setActiveMock, toastMock, pushMock, replaceMock, sessionState, getSessionMock } =
  vi.hoisted(() => ({
    client: { get: vi.fn(), post: vi.fn() },
    setActiveMock: vi.fn(),
    toastMock: { success: vi.fn(), error: vi.fn() },
    pushMock: vi.fn(),
    replaceMock: vi.fn(),
    sessionState: {
      current: {} as {
        data: { user: { name: string; termsAcceptedVersion?: string } } | null;
        isPending: boolean;
      },
    },
    getSessionMock: vi.fn(),
  }));

vi.mock("@/lib/http-client", () => ({ httpClient: client }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    organization: { setActive: setActiveMock },
    useSession: () => sessionState.current,
    getSession: getSessionMock,
  },
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

import { CURRENT_TERMS_VERSION } from "@ayni/env/terms";
import JoinInvitation from "./join";

function renderJoin() {
  return render(<JoinInvitation token="tok-1" />);
}

describe("JoinInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionState.current = {
      data: { user: { name: "Diego", termsAcceptedVersion: CURRENT_TERMS_VERSION } },
      isPending: false,
    };
    getSessionMock.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows 'Cargando invitación…' while the preview is in flight", async () => {
    client.get.mockReturnValue(new Promise(() => {}));
    renderJoin();
    expect(await screen.findByText("Cargando invitación…")).toBeTruthy();
  });

  it("waits for the browser session before loading the invitation", async () => {
    sessionState.current = { data: null, isPending: true };
    renderJoin();
    expect(await screen.findByText("Cargando invitación…")).toBeTruthy();
    expect(client.get).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("sends a visitor without a session to sign in and back to the invitation", async () => {
    sessionState.current = { data: null, isPending: false };
    renderJoin();
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        `/sign-in?next=${encodeURIComponent("/join?token=tok-1")}`,
      ),
    );
    expect(client.get).not.toHaveBeenCalled();
  });

  it("sends a user without the current terms to sign in and back to the invitation", async () => {
    sessionState.current = {
      data: { user: { name: "Diego", termsAcceptedVersion: "0.9.0" } },
      isPending: false,
    };
    getSessionMock.mockResolvedValue({ data: sessionState.current.data, error: null });
    renderJoin();
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        `/sign-in?next=${encodeURIComponent("/join?token=tok-1")}`,
      ),
    );
    expect(client.get).not.toHaveBeenCalled();
  });

  it("stays on the invitation while the session store lags behind a fresh sign-in", async () => {
    sessionState.current = { data: null, isPending: false };
    getSessionMock.mockResolvedValue({
      data: { user: { name: "Diego", termsAcceptedVersion: CURRENT_TERMS_VERSION } },
      error: null,
    });
    renderJoin();

    await waitFor(() => expect(getSessionMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByText("Cargando invitación…")).toBeTruthy();
  });

  it("shows the invalid message without any request when the URL has no token", async () => {
    render(<JoinInvitation token="" />);
    expect(await screen.findByText("Este enlace de invitación no es válido.")).toBeTruthy();
    expect(client.get).not.toHaveBeenCalled();
  });

  it("previews the invited workspace and role for a valid token", async () => {
    client.get.mockResolvedValue({
      data: {
        invitation: {
          id: "inv-1",
          organizationId: "org-1",
          organizationName: "Laboratorio Andino",
          role: "member",
          expiresAt: "2026-10-01T00:00:00.000Z",
        },
      },
    });
    renderJoin();

    expect(client.get).toHaveBeenCalledWith("/invitation-links/tok-1");
    expect(await screen.findByText("Laboratorio Andino")).toBeTruthy();
    expect(screen.getByText("Miembro")).toBeTruthy();
    expect(screen.getByRole("button", { name: /unirse al workspace/i })).toBeTruthy();
  });

  it("joins the workspace, activates it and redirects to the dashboard", async () => {
    client.get.mockResolvedValue({
      data: {
        invitation: {
          id: "inv-1",
          organizationId: "org-1",
          organizationName: "Laboratorio Andino",
          role: "member",
          expiresAt: "2026-10-01T00:00:00.000Z",
        },
      },
    });
    client.post.mockResolvedValue({
      data: { organization: { id: "org-1", name: "Laboratorio Andino", role: "member" } },
    });
    setActiveMock.mockResolvedValue({});

    renderJoin();
    fireEvent.click(await screen.findByRole("button", { name: /unirse al workspace/i }));

    await waitFor(() => expect(client.post).toHaveBeenCalledWith("/invitation-links/tok-1/accept"));
    await waitFor(() => expect(setActiveMock).toHaveBeenCalledWith({ organizationId: "org-1" }));
    expect(toastMock.success).toHaveBeenCalledWith("Te uniste a Laboratorio Andino.");
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("does not claim activation when setActive reports an error, but confirms the membership", async () => {
    client.get.mockResolvedValue({
      data: {
        invitation: {
          id: "inv-1",
          organizationId: "org-1",
          organizationName: "Laboratorio Andino",
          role: "member",
          expiresAt: "2026-10-01T00:00:00.000Z",
        },
      },
    });
    client.post.mockResolvedValue({
      data: { organization: { id: "org-1", name: "Laboratorio Andino", role: "member" } },
    });
    setActiveMock.mockResolvedValue({ error: { message: "activation failed" } });

    renderJoin();
    fireEvent.click(await screen.findByRole("button", { name: /unirse al workspace/i }));

    expect(
      await screen.findByText(
        "Te uniste a Laboratorio Andino, pero no pudimos cambiar al workspace automáticamente.",
      ),
    ).toBeTruthy();
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /ir al dashboard/i })).toBeTruthy();
  });

  it("keeps the join confirmation when setActive throws", async () => {
    client.get.mockResolvedValue({
      data: {
        invitation: {
          id: "inv-1",
          organizationId: "org-1",
          organizationName: "Laboratorio Andino",
          role: "member",
          expiresAt: "2026-10-01T00:00:00.000Z",
        },
      },
    });
    client.post.mockResolvedValue({
      data: { organization: { id: "org-1", name: "Laboratorio Andino", role: "member" } },
    });
    setActiveMock.mockRejectedValue(new Error("network"));

    renderJoin();
    fireEvent.click(await screen.findByRole("button", { name: /unirse al workspace/i }));

    expect(
      await screen.findByText(
        "Te uniste a Laboratorio Andino, pero no pudimos cambiar al workspace automáticamente.",
      ),
    ).toBeTruthy();
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows the invalid message when the token is unknown, used or expired", async () => {
    client.get.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { message: "Este enlace de invitación no es válido." } },
    });
    renderJoin();

    expect(await screen.findByText("Este enlace de invitación no es válido.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /unirse al workspace/i })).toBeNull();
  });

  it("explains that the user is already a member when accepting fails with 409", async () => {
    client.get.mockResolvedValue({
      data: {
        invitation: {
          id: "inv-1",
          organizationId: "org-1",
          organizationName: "Laboratorio Andino",
          role: "member",
          expiresAt: "2026-10-01T00:00:00.000Z",
        },
      },
    });
    client.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { message: "Ya eres miembro de este workspace." } },
    });
    setActiveMock.mockResolvedValue({});

    renderJoin();
    fireEvent.click(await screen.findByRole("button", { name: /unirse al workspace/i }));

    expect(await screen.findByText("Ya eres miembro de este workspace.")).toBeTruthy();
    await waitFor(() => expect(setActiveMock).toHaveBeenCalledWith({ organizationId: "org-1" }));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("still activates the invited workspace when the user is already a member", async () => {
    client.get.mockResolvedValue({
      data: {
        invitation: {
          id: "inv-1",
          organizationId: "org-1",
          organizationName: "Laboratorio Andino",
          role: "member",
          expiresAt: "2026-10-01T00:00:00.000Z",
        },
      },
    });
    client.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { message: "Ya eres miembro de este workspace." } },
    });
    setActiveMock.mockResolvedValue({ error: { message: "activation failed" } });

    renderJoin();
    fireEvent.click(await screen.findByRole("button", { name: /unirse al workspace/i }));

    expect(
      await screen.findByText(
        "Ya eres miembro de este workspace, pero no pudimos cambiar al workspace automáticamente.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /ir al dashboard/i })).toBeTruthy();
  });
});
