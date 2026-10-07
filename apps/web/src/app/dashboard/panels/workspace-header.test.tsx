// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Application } from "../types";
import { WorkspaceHeader } from "./workspace-header";

const { pushMock, signOutMock, useSessionMock } = vi.hoisted(() => {
  const sessionRef = {
    data: { user: { name: "Diego sesión", email: "diego@example.test" } },
    isPending: false,
  };
  return {
    pushMock: vi.fn(),
    signOutMock: vi.fn(),
    useSessionMock: vi.fn(() => sessionRef),
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: useSessionMock,
    signOut: signOutMock,
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

  it("opens a read-only profile with the current session name and email", async () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Diego" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mi perfil" }));

    const profile = await screen.findByRole("dialog", { name: "Mi perfil" });
    expect(useSessionMock).toHaveBeenCalled();
    expect(within(profile).getByText("Diego sesión")).toBeTruthy();
    expect(within(profile).getByText("diego@example.test")).toBeTruthy();
    expect(within(profile).queryByRole("textbox")).toBeNull();
  });

  it("signs out through Better Auth and redirects only after success", async () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Diego" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Cerrar sesión" }));

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();

    const callback = signOutMock.mock.calls[0]?.[0]?.fetchOptions?.onSuccess;
    expect(callback).toBeTypeOf("function");
    callback?.();

    expect(pushMock).toHaveBeenCalledWith("/");
  });
});
