// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MembersPanel } from "./members-panel";

const { client, toastMock, writeTextMock } = vi.hoisted(() => ({
  client: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  toastMock: { success: vi.fn(), error: vi.fn() },
  writeTextMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/http-client", () => ({ httpClient: client }));
vi.mock("sonner", () => ({ toast: toastMock }));

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: { writeText: writeTextMock },
  });
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
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

describe("MembersPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.get.mockResolvedValue({
      data: [
        { id: "mem-1", name: "Diego", email: "diego@example.com", role: "owner" },
        { id: "mem-2", name: "María", email: "maria@example.com", role: "member" },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("lists workspace members with names, emails and formatted roles", async () => {
    render(
      <TooltipProvider>
        <MembersPanel workspaceId="org-1" workspaceName="Laboratorio Andino" canManage={true} />
      </TooltipProvider>,
    );

    expect(await screen.findByText("Diego")).toBeTruthy();
    expect(screen.getByText("diego@example.com")).toBeTruthy();
    expect(screen.getByText("Propietario")).toBeTruthy();

    expect(screen.getByText("María")).toBeTruthy();
    expect(screen.getByText("maria@example.com")).toBeTruthy();
    expect(screen.getByText("Miembro", { selector: ".application-status" })).toBeTruthy();
  });

  it("shows loading and error states with retry", async () => {
    client.get.mockRejectedValueOnce(new Error("Network failure"));

    render(
      <TooltipProvider>
        <MembersPanel workspaceId="org-1" workspaceName="Laboratorio Andino" canManage={true} />
      </TooltipProvider>,
    );

    expect(
      await screen.findByText("No pudimos cargar los miembros. Inténtalo de nuevo."),
    ).toBeTruthy();
    const retryBtn = screen.getByRole("button", { name: /reintentar/i });
    expect(retryBtn).toBeTruthy();

    client.get.mockResolvedValueOnce({
      data: [{ id: "mem-1", name: "Diego", email: "diego@example.com", role: "owner" }],
    });
    fireEvent.click(retryBtn);

    expect(await screen.findByText("Diego")).toBeTruthy();
  });

  it("allows admin to change a member's role", async () => {
    client.patch.mockResolvedValueOnce({
      data: { id: "mem-2", name: "María", email: "maria@example.com", role: "admin" },
    });

    render(
      <TooltipProvider>
        <MembersPanel workspaceId="org-1" workspaceName="Laboratorio Andino" canManage={true} />
      </TooltipProvider>,
    );

    expect(await screen.findByText("María")).toBeTruthy();

    const menuBtn = screen.getByTestId("member-menu-mem-2");
    fireEvent.click(menuBtn);

    const changeRoleItem = await screen.findByText("Cambiar rol");
    fireEvent.click(changeRoleItem);

    expect(screen.getByRole("dialog", { name: "Cambiar rol" })).toBeTruthy();
    const trigger = screen.getByTestId("role-selector-trigger");
    fireEvent.click(trigger);

    const adminOption = await screen.findByTestId("role-option-admin");
    fireEvent.click(adminOption);

    const submitBtn = screen.getByRole("button", { name: "Actualizar rol" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(client.patch).toHaveBeenCalledWith("/organizations/org-1/members/mem-2", {
        role: "admin",
      });
      expect(toastMock.success).toHaveBeenCalledWith("Rol actualizado.");
    });
  });

  it("removes a member after explicit confirmation", async () => {
    client.delete.mockResolvedValueOnce({});

    render(
      <TooltipProvider>
        <MembersPanel workspaceId="org-1" workspaceName="Laboratorio Andino" canManage={true} />
      </TooltipProvider>,
    );

    expect(await screen.findByText("María")).toBeTruthy();

    const menuBtn = screen.getByTestId("member-menu-mem-2");
    fireEvent.click(menuBtn);

    const removeBtn = await screen.findByText("Retirar miembro");
    fireEvent.click(removeBtn);

    expect(
      screen.getByRole("dialog", { name: "¿Retirar a este miembro del workspace?" }),
    ).toBeTruthy();
    const confirmBtn = screen.getByTestId("confirm-remove-member");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(client.delete).toHaveBeenCalledWith("/organizations/org-1/members/mem-2");
      expect(toastMock.success).toHaveBeenCalledWith("Miembro retirado.");
      expect(screen.queryByText("maria@example.com")).toBeNull();
    });
  });

  it("creates an invitation link and copies the URL", async () => {
    client.post.mockResolvedValueOnce({
      data: { invitation: { token: "token-abc-123" } },
    });

    render(
      <TooltipProvider>
        <MembersPanel workspaceId="org-1" workspaceName="Laboratorio Andino" canManage={true} />
      </TooltipProvider>,
    );

    const inviteBtn = await screen.findByRole("button", { name: /crear enlace de invitación/i });
    fireEvent.click(inviteBtn);

    const submitBtn = screen.getByTestId("create-invitation-submit");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith("/organizations/org-1/invitation-links", {
        role: "member",
      });
      expect(toastMock.success).toHaveBeenCalledWith("Enlace de invitación creado.");
    });

    const copyBtn = screen.getByRole("button", { name: "Copiar enlace" });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("token=token-abc-123"));
      expect(toastMock.success).toHaveBeenCalledWith("Enlace copiado.");
    });
  });

  it("hides management actions when canManage is false", async () => {
    render(
      <TooltipProvider>
        <MembersPanel workspaceId="org-1" workspaceName="Laboratorio Andino" canManage={false} />
      </TooltipProvider>,
    );

    expect(await screen.findByText("María")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /crear enlace de invitación/i })).toBeNull();
    expect(screen.queryByTestId("member-menu-mem-2")).toBeNull();
  });
});
