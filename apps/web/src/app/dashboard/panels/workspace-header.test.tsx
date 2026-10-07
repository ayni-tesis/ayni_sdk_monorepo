// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Application } from "../types";
import { WorkspaceHeader } from "./workspace-header";

const {
  changePasswordMock,
  pushMock,
  refetchMock,
  sendVerificationEmailMock,
  signOutMock,
  toastErrorMock,
  updateUserMock,
  useSessionMock,
  sessionRef,
} = vi.hoisted(() => {
  const sessionRef = {
    data: { user: { name: "Diego sesión", email: "diego@example.test", emailVerified: false } },
    isPending: false,
    error: null as Error | null,
    refetch: vi.fn(),
  };
  return {
    pushMock: vi.fn(),
    changePasswordMock: vi.fn(),
    refetchMock: sessionRef.refetch,
    sendVerificationEmailMock: vi.fn(),
    signOutMock: vi.fn(),
    toastErrorMock: vi.fn(),
    updateUserMock: vi.fn(),
    useSessionMock: vi.fn(() => sessionRef),
    sessionRef,
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("sonner", () => ({ toast: { error: toastErrorMock } }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: useSessionMock,
    signOut: signOutMock,
    updateUser: updateUserMock,
    sendVerificationEmail: sendVerificationEmailMock,
    changePassword: changePasswordMock,
  },
}));

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
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

describe("WorkspaceHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOutMock.mockResolvedValue({ error: null });
    updateUserMock.mockResolvedValue({ error: null });
    sendVerificationEmailMock.mockResolvedValue({ error: null });
    changePasswordMock.mockResolvedValue({ error: null });
    sessionRef.data = {
      user: { name: "Diego sesión", email: "diego@example.test", emailVerified: false },
    };
    sessionRef.isPending = false;
    sessionRef.error = null;
  });

  afterEach(() => {
    cleanup();
  });

  const appOne: Application = {
    id: "app-1",
    organizationId: "org-1",
    name: "Cámara",
    status: "active",
  };
  const appTwo: Application = {
    id: "app-2",
    organizationId: "org-1",
    name: "Sensores",
    status: "active",
  };

  function renderHeader(props: Partial<Parameters<typeof WorkspaceHeader>[0]> = {}) {
    return render(
      <SidebarProvider>
        <TooltipProvider>
          <WorkspaceHeader userName="Diego" workspaceName="Laboratorio Andino" {...props} />
        </TooltipProvider>
      </SidebarProvider>,
    );
  }

  it("shows the user name and the workspace as the current page when no application is open", () => {
    renderHeader({ activeView: "applications" });

    expect(screen.getByText("Diego")).toBeTruthy();
    expect(screen.getByText("Workspace actual")).toBeTruthy();
    expect(screen.getByText("Laboratorio Andino")).toBeTruthy();
    expect(screen.getByText("Aplicaciones")).toBeTruthy();
  });

  it("labels the section crumb for the members view", () => {
    renderHeader({ activeView: "members" });

    expect(screen.getByText("Miembros")).toBeTruthy();
  });

  it("links back to the dashboard and shows the section crumb when an application is open", () => {
    const onNavigateHome = vi.fn();
    renderHeader({
      selectedApplication: appOne,
      applications: [appOne],
      activeView: "models",
      onNavigateHome,
    });

    expect(screen.getByText("Cámara")).toBeTruthy();
    expect(screen.getByText("Modelos")).toBeTruthy();

    const workspaceLink = screen.getByRole("link", { name: "Laboratorio Andino" });
    expect(workspaceLink.getAttribute("href")).toBe("/dashboard");
    fireEvent.click(workspaceLink);
    expect(onNavigateHome).toHaveBeenCalled();
  });

  it("does not repeat a section crumb on the application overview", () => {
    renderHeader({
      selectedApplication: appOne,
      applications: [appOne],
      activeView: "overview",
    });

    expect(screen.getByText("Cámara")).toBeTruthy();
    expect(screen.queryByText("Resumen")).toBeNull();
    expect(screen.queryByText("Aplicaciones")).toBeNull();
  });

  it("lists other applications in the dropdown and selects one", async () => {
    const onSelectApplication = vi.fn();
    renderHeader({
      selectedApplication: appOne,
      applications: [appOne, appTwo],
      activeView: "overview",
      onSelectApplication,
    });

    fireEvent.click(screen.getByText("Cámara"));

    const option = await screen.findByRole("menuitem", { name: /sensores/i });
    fireEvent.click(option);
    expect(onSelectApplication).toHaveBeenCalledWith("app-2");
  });

  it("shows a 'ver todas' option that navigates home", async () => {
    const onNavigateHome = vi.fn();
    renderHeader({
      selectedApplication: appOne,
      applications: [appOne, appTwo],
      activeView: "overview",
      onNavigateHome,
    });

    fireEvent.click(screen.getByText("Cámara"));

    const allItem = await screen.findByRole("menuitem", { name: /ver todas las aplicaciones/i });
    fireEvent.click(allItem);
    expect(onNavigateHome).toHaveBeenCalled();
  });

  it("opens the documentation from the Ayuda menu in a new tab", async () => {
    renderHeader({ activeView: "applications" });

    fireEvent.click(screen.getByRole("button", { name: "Ayuda" }));

    const item = await screen.findByRole("menuitem", {
      name: "Documentación (se abre en una pestaña nueva)",
    });
    expect(item.tagName).toBe("A");
    expect(item.getAttribute("href")).toMatch(/^https?:\/\/[^/]+\/$/);
    expect(item.getAttribute("target")).toBe("_blank");
  });

  it("opens a name menu with only profile and sign-out actions", async () => {
    renderHeader();

    fireEvent.click(screen.getByRole("button", { name: "Diego" }));

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent?.trim())).toEqual(["Mi perfil", "Cerrar sesión"]);
  });

  it("loads session details only when the profile view opens", () => {
    renderHeader();

    expect(useSessionMock).not.toHaveBeenCalled();
  });

  it("shows the session profile with the email kept read-only", async () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Diego" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mi perfil" }));

    const profile = await screen.findByRole("dialog", { name: "Mi perfil" });
    expect(useSessionMock).toHaveBeenCalled();
    expect((within(profile).getByLabelText("Nombre") as HTMLInputElement).value).toBe(
      "Diego sesión",
    );
    expect(within(profile).getByText("diego@example.test")).toBeTruthy();
    expect(profile.querySelector('input[type="email"]')).toBeNull();
  });

  it("shows the loading profile state", async () => {
    sessionRef.isPending = true;
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Diego" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mi perfil" }));

    expect((await screen.findByRole("status")).textContent).toContain("Cargando perfil...");
  });

  it("offers a retry when the profile session fails to load", async () => {
    sessionRef.error = new Error("network error");
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Diego" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mi perfil" }));

    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toContain(
      "No pudimos cargar tu perfil. Inténtalo nuevamente.",
    );
  });

  it("updates only the authenticated user's name after server confirmation", async () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Diego" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mi perfil" }));
    fireEvent.change(await screen.findByLabelText("Nombre"), { target: { value: "Ada Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateUserMock).toHaveBeenCalledWith({ name: "Ada Lovelace" }));
    expect(await screen.findByText("Perfil actualizado.")).toBeTruthy();
    expect(refetchMock).toHaveBeenCalled();
  });

  it("keeps the saved name when the update fails", async () => {
    updateUserMock.mockResolvedValue({ error: new Error("server error") });
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Diego" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mi perfil" }));
    const nameInput = (await screen.findByLabelText("Nombre")) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Ada Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "No pudimos actualizar tu perfil. Inténtalo nuevamente.",
    );
    expect(nameInput.value).toBe("Diego sesión");
  });

  it("does not send a profile name that is too short", async () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Diego" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mi perfil" }));
    fireEvent.change(await screen.findByLabelText("Nombre"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "El nombre debe tener entre 2 y 100 caracteres.",
    );
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("shows the pending email state and resends a verification link", async () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Diego" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mi perfil" }));

    expect(screen.getByText("Correo pendiente de verificación")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace de verificación" }));
    await waitFor(() =>
      expect(sendVerificationEmailMock).toHaveBeenCalledWith({
        email: "diego@example.test",
        callbackURL: `${window.location.origin}/verify-email`,
      }),
    );
    expect(
      await screen.findByText("Enlace de verificación enviado a diego@example.test."),
    ).toBeTruthy();
  });

  it("shows verified email state without offering another verification link", async () => {
    sessionRef.data.user.emailVerified = true;
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Diego" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mi perfil" }));

    expect(screen.getByText("Correo verificado")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enviar enlace de verificación" })).toBeNull();
  });

  it("changes the password after submitting both password fields", async () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Diego" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mi perfil" }));
    fireEvent.change(screen.getByLabelText("Contraseña actual"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    await waitFor(() =>
      expect(changePasswordMock).toHaveBeenCalledWith({
        currentPassword: "old-password",
        newPassword: "new-password",
      }),
    );
    expect(await screen.findByText("Contraseña actualizada.")).toBeTruthy();
  });

  it("explains when the current password is incorrect", async () => {
    changePasswordMock.mockResolvedValue({
      error: { code: "INVALID_PASSWORD", message: "Invalid password" },
    });
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Diego" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mi perfil" }));
    fireEvent.change(screen.getByLabelText("Contraseña actual"), {
      target: { value: "wrong-password" },
    });
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "No pudimos verificar tu contraseña actual.",
    );
  });

  it("signs out through Better Auth and redirects after the server confirms", async () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Diego" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Cerrar sesión" }));

    expect(signOutMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
  });

  it("keeps the current route after an error and lets the person retry", async () => {
    signOutMock.mockResolvedValueOnce({ error: new Error("network error") });
    renderHeader();

    fireEvent.click(screen.getByRole("button", { name: "Diego" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Cerrar sesión" }));
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "No pudimos cerrar sesión. Inténtalo nuevamente.",
      ),
    );
    expect(pushMock).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Diego" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Cerrar sesión" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
    expect(signOutMock).toHaveBeenCalledTimes(2);
  });
});
