// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceSwitcher } from "./workspace-switcher";

const { authOrgMock, toastMock } = vi.hoisted(() => ({
  authOrgMock: {
    create: vi.fn(),
    setActive: vi.fn(),
  },
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    organization: authOrgMock,
  },
}));
vi.mock("sonner", () => ({ toast: toastMock }));

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

function withChrome(children: React.ReactNode) {
  return (
    <SidebarProvider>
      <TooltipProvider>
        <Sidebar>{children}</Sidebar>
      </TooltipProvider>
    </SidebarProvider>
  );
}

function renderSwitcher(props: Parameters<typeof WorkspaceSwitcher>[0]) {
  return render(withChrome(<WorkspaceSwitcher {...props} />));
}

describe("WorkspaceSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authOrgMock.create.mockResolvedValue({
      data: { id: "org-new", name: "BioTec", slug: "biotec-12345" },
    });
    authOrgMock.setActive.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  it("displays the active workspace and lists workspaces with localized roles", async () => {
    const onSelect = vi.fn();
    renderSwitcher({
      workspaces: [
        { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
        { id: "org-2", name: "BioTec", slug: "biotec", role: "member" },
      ],
      activeWorkspaceId: "org-1",
      workspaceName: "Laboratorio Andino",
      onSelectWorkspace: onSelect,
    });

    const trigger = screen.getByTestId("workspace-selector-trigger");
    expect(trigger.textContent).toContain("Laboratorio Andino");

    fireEvent.click(trigger);

    expect(await screen.findByText("BioTec")).toBeTruthy();
    expect(screen.getByText("Miembro")).toBeTruthy();
    expect(screen.getByText("Administrador")).toBeTruthy();

    fireEvent.click(screen.getByText("BioTec"));
    expect(onSelect).toHaveBeenCalledWith("org-2");
  });

  it("shows loading and error states with retry", async () => {
    const onRetry = vi.fn();
    const { rerender } = renderSwitcher({
      workspaces: [],
      loadingWorkspaces: true,
      switchingWorkspace: false,
    });

    expect(screen.getByText("Cargando workspace…")).toBeTruthy();

    rerender(
      withChrome(
        <WorkspaceSwitcher
          workspaces={[]}
          loadingWorkspaces={false}
          workspacesError="Fallo al conectar"
          switchingWorkspace={false}
          onRetryWorkspaces={onRetry}
        />,
      ),
    );

    expect(screen.getByText("Error al cargar workspaces")).toBeTruthy();
    fireEvent.click(screen.getByTestId("workspace-selector-trigger"));

    const retryItem = await screen.findByRole("menuitem", { name: /reintentar/i });
    fireEvent.click(retryItem);
    expect(onRetry).toHaveBeenCalled();
  });

  it("opens create workspace dialog from dropdown, validates input, and creates workspace", async () => {
    const onCreated = vi.fn();
    renderSwitcher({
      workspaces: [
        { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
      ],
      workspaceName: "Laboratorio Andino",
      onWorkspaceCreated: onCreated,
    });

    fireEvent.click(screen.getByTestId("workspace-selector-trigger"));
    const createItem = await screen.findByRole("menuitem", { name: /crear workspace/i });
    fireEvent.click(createItem);

    expect(screen.getByRole("dialog", { name: "Crear workspace" })).toBeTruthy();
    const submitBtn = screen.getByTestId("create-workspace-submit");

    fireEvent.click(submitBtn);
    expect(await screen.findByText("Ingresa un nombre para el workspace.")).toBeTruthy();
    expect(authOrgMock.create).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Nombre del workspace"), {
      target: { value: "BioTec" },
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authOrgMock.create).toHaveBeenCalledWith({
        name: "BioTec",
        slug: expect.stringMatching(/^biotec-[a-z0-9]+$/),
      });
      expect(authOrgMock.setActive).toHaveBeenCalledWith({ organizationId: "org-new" });
      expect(toastMock.success).toHaveBeenCalledWith("Workspace creado.");
      expect(onCreated).toHaveBeenCalledWith("org-new");
    });
  });
});
