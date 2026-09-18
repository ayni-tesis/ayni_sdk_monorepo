// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

const { client, activeOrgRef, activeMemberRoleRef, authOrgMock, toastMock } = vi.hoisted(() => ({
  client: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  activeOrgRef: {
    current: { id: "org-1", name: "Laboratorio Andino" } as { id: string; name: string } | null,
  },
  activeMemberRoleRef: {
    current: "admin",
  },
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
    useActiveOrganization: () => ({ data: activeOrgRef.current, isPending: false }),
    useActiveMemberRole: () => ({ data: { role: activeMemberRoleRef.current } }),
    organization: authOrgMock,
  },
}));
vi.mock("@/lib/http-client", () => ({ httpClient: client }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("./dashboard.css", () => ({}));

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

import Dashboard from "./dashboard";

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeMemberRoleRef.current = "admin";
    activeOrgRef.current = { id: "org-1", name: "Laboratorio Andino" };
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
          ],
        };
      }
      return { data: [] };
    });
    authOrgMock.create.mockResolvedValue({
      data: { id: "org-new", name: "BioTec", slug: "biotec-12345" },
    });
    authOrgMock.setActive.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  it("lists workspace applications and opens their protected detail", async () => {
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
          ],
        };
      }
      if (url === "/organizations/org-1/applications") {
        return {
          data: [{ id: "app-1", organizationId: "org-1", name: "Cámara", status: "active" }],
        };
      }
      if (url === "/applications/app-1") {
        return {
          data: { id: "app-1", organizationId: "org-1", name: "Cámara", status: "active" },
        };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    expect(await screen.findByRole("button", { name: /cámara/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /cámara/i }));

    await waitFor(() => expect(screen.getByText("ID de aplicación")).toBeTruthy());
    expect(client.get).toHaveBeenCalledWith("/applications/app-1");
  });

  it("ignores responses from a previous workspace after the workspace changes", async () => {
    let resolveFirstRequest: (value: { data: unknown }) => void = () => {};
    client.get.mockImplementation((url: string) => {
      if (url === "/workspaces") {
        return Promise.resolve({
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
            { id: "org-2", name: "Nuevo Workspace", slug: "nuevo-workspace", role: "admin" },
          ],
        });
      }
      if (url === "/organizations/org-1/applications") {
        return new Promise((resolve) => {
          resolveFirstRequest = resolve;
        });
      }
      if (url === "/organizations/org-2/applications") {
        return Promise.resolve({
          data: [{ id: "app-2", organizationId: "org-2", name: "App Dos", status: "active" }],
        });
      }
      return Promise.resolve({ data: [] });
    });

    const { rerender } = render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    activeOrgRef.current = { id: "org-2", name: "Nuevo Workspace" };
    rerender(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    resolveFirstRequest({
      data: [{ id: "app-1", organizationId: "org-1", name: "App Uno", status: "active" }],
    });

    expect(await screen.findByRole("button", { name: /app dos/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /app uno/i })).toBeNull();
  });

  it("validates that workspace name is required and shows error message on empty submission", async () => {
    activeOrgRef.current = null;
    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    const openCreateBtn = screen.getByTestId("create-workspace-trigger");
    fireEvent.click(openCreateBtn);

    expect(screen.getByRole("dialog", { name: "Crear workspace" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Crear workspace" })).toBeTruthy();
    expect(screen.getByLabelText("Nombre del workspace")).toBeTruthy();

    const submitBtn = screen.getByTestId("create-workspace-submit");
    fireEvent.click(submitBtn);

    expect(await screen.findByText("Ingresa un nombre para el workspace.")).toBeTruthy();
    expect(authOrgMock.create).not.toHaveBeenCalled();
  });

  it("disables the Cancel button while workspace creation is in flight", async () => {
    activeOrgRef.current = null;
    let resolveCreate: (value: unknown) => void = () => {};
    authOrgMock.create.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByTestId("create-workspace-trigger"));

    const cancelBtn = screen.getByRole("button", { name: "Cancelar" });
    expect((cancelBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(screen.getByLabelText("Nombre del workspace"), {
      target: { value: "Mi Equipo" },
    });

    fireEvent.click(screen.getByTestId("create-workspace-submit"));

    expect((cancelBtn as HTMLButtonElement).disabled).toBe(true);

    resolveCreate({ error: { message: "Error al crear" } });
    await waitFor(() => expect((cancelBtn as HTMLButtonElement).disabled).toBe(false));
  });

  it("creates a new workspace, calls Better Auth, sets it as active, and confirms success", async () => {
    activeOrgRef.current = null;
    authOrgMock.create.mockResolvedValueOnce({
      data: { id: "org-new", name: "BioTec", slug: "biotec-12345" },
    });
    authOrgMock.setActive.mockResolvedValueOnce({});

    let workspacesFetch = 0;
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        workspacesFetch++;
        return {
          data:
            workspacesFetch === 1
              ? [
                  {
                    id: "org-1",
                    name: "Laboratorio Andino",
                    slug: "laboratorio-andino",
                    role: "admin",
                  },
                ]
              : [
                  {
                    id: "org-1",
                    name: "Laboratorio Andino",
                    slug: "laboratorio-andino",
                    role: "admin",
                  },
                  { id: "org-new", name: "BioTec", slug: "biotec-12345", role: "owner" },
                ],
        };
      }
      return { data: [] };
    });

    const { rerender } = render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    const openCreateBtn = screen.getByTestId("create-workspace-trigger");
    fireEvent.click(openCreateBtn);

    const nameInput = screen.getByLabelText("Nombre del workspace");
    fireEvent.change(nameInput, { target: { value: "BioTec" } });

    const submitBtn = screen.getByTestId("create-workspace-submit");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authOrgMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "BioTec",
          slug: expect.stringMatching(/^biotec-/),
        }),
      );
    });

    await waitFor(() => {
      expect(authOrgMock.setActive).toHaveBeenCalledWith({
        organizationId: "org-new",
      });
    });

    expect(toastMock.success).toHaveBeenCalledWith("Workspace creado.");

    activeOrgRef.current = { id: "org-new", name: "BioTec" };

    rerender(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    expect((await screen.findAllByText("BioTec")).length).toBeGreaterThanOrEqual(1);
  });

  it("allows opening create workspace dialog from the workspace selector in the header", async () => {
    client.get.mockResolvedValueOnce({ data: [] });
    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    const selectorTrigger = await screen.findByTestId("workspace-selector-trigger");
    fireEvent.pointerDown(selectorTrigger);
    fireEvent.click(selectorTrigger);

    const createMenuItem = await screen.findByRole("menuitem", { name: /crear workspace/i });
    fireEvent.click(createMenuItem);

    expect(screen.getByRole("heading", { name: "Crear workspace" })).toBeTruthy();
  });

  it("refreshes memberships and closes the dialog when workspace activation fails", async () => {
    activeOrgRef.current = null;
    authOrgMock.create.mockResolvedValueOnce({
      data: { id: "org-new", name: "BioTec", slug: "biotec-12345" },
    });
    authOrgMock.setActive.mockResolvedValueOnce({
      error: { message: "Error al activar el workspace" },
    });

    let workspacesFetch = 0;
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        workspacesFetch++;
        return {
          data:
            workspacesFetch === 1
              ? [
                  {
                    id: "org-1",
                    name: "Laboratorio Andino",
                    slug: "laboratorio-andino",
                    role: "admin",
                  },
                ]
              : [
                  {
                    id: "org-1",
                    name: "Laboratorio Andino",
                    slug: "laboratorio-andino",
                    role: "admin",
                  },
                  { id: "org-new", name: "BioTec", slug: "biotec-12345", role: "owner" },
                ],
        };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByTestId("create-workspace-trigger"));
    fireEvent.change(screen.getByLabelText("Nombre del workspace"), {
      target: { value: "BioTec" },
    });
    fireEvent.click(screen.getByTestId("create-workspace-submit"));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith("Error al activar el workspace");
    });
    expect(toastMock.success).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(client.get.mock.calls.filter(([url]) => url === "/workspaces").length).toBe(2);
    });

    expect(screen.queryByRole("dialog", { name: "Crear workspace" })).toBeNull();

    const selectorTrigger = screen.getByTestId("workspace-selector-trigger");
    fireEvent.click(selectorTrigger);
    const biotecOption = await screen.findByText("BioTec");
    fireEvent.click(biotecOption);
    await waitFor(() => {
      expect(authOrgMock.setActive).toHaveBeenCalledWith({ organizationId: "org-new" });
    });
  });

  it("retries creation with a new slug when Better Auth returns ORGANIZATION_SLUG_ALREADY_TAKEN", async () => {
    activeOrgRef.current = null;
    authOrgMock.create
      .mockResolvedValueOnce({
        error: { code: "ORGANIZATION_SLUG_ALREADY_TAKEN", message: "Slug taken" },
      })
      .mockResolvedValueOnce({
        data: { id: "org-retry", name: "RetryCorp", slug: "retrycorp-new" },
      });
    authOrgMock.setActive.mockResolvedValueOnce({});

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByTestId("create-workspace-trigger"));
    fireEvent.change(screen.getByLabelText("Nombre del workspace"), {
      target: { value: "RetryCorp" },
    });
    fireEvent.click(screen.getByTestId("create-workspace-submit"));

    await waitFor(() => {
      expect(authOrgMock.create).toHaveBeenCalledTimes(2);
    });
    expect(authOrgMock.setActive).toHaveBeenCalledWith({
      organizationId: "org-retry",
    });
    expect(toastMock.success).toHaveBeenCalledWith("Workspace creado.");
  });

  it("does not retry creation when Better Auth returns an error other than slug taken", async () => {
    activeOrgRef.current = null;
    authOrgMock.create.mockResolvedValueOnce({
      error: { code: "FORBIDDEN", message: "No tienes permiso" },
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByTestId("create-workspace-trigger"));
    fireEvent.change(screen.getByLabelText("Nombre del workspace"), {
      target: { value: "FailCorp" },
    });
    fireEvent.click(screen.getByTestId("create-workspace-submit"));

    await waitFor(() => {
      expect(authOrgMock.create).toHaveBeenCalledTimes(1);
    });
    expect(toastMock.error).toHaveBeenCalledWith("No tienes permiso");
    expect(authOrgMock.setActive).not.toHaveBeenCalled();
  });

  it("displays 'Workspace actual' and lists each workspace with its localized role", async () => {
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "owner" },
            { id: "org-2", name: "Coffee Lab", slug: "coffee-lab", role: "member" },
          ],
        };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    expect(await screen.findByText("Workspace actual")).toBeTruthy();

    const selectorTrigger = screen.getByTestId("workspace-selector-trigger");
    fireEvent.click(selectorTrigger);

    expect(await screen.findByText("Coffee Lab")).toBeTruthy();
    expect(screen.getByText("Propietario")).toBeTruthy();
    expect(screen.getByText("Miembro")).toBeTruthy();
  });

  it("switches active workspace, clears previous applications immediately, and calls setActive", async () => {
    let resolveSetActive: (value: unknown) => void = () => {};
    authOrgMock.setActive.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSetActive = resolve;
      }),
    );

    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "owner" },
            { id: "org-2", name: "Coffee Lab", slug: "coffee-lab", role: "member" },
          ],
        };
      }
      if (url === "/organizations/org-1/applications") {
        return {
          data: [{ id: "app-1", organizationId: "org-1", name: "Cámara", status: "active" }],
        };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    expect(await screen.findByRole("button", { name: /cámara/i })).toBeTruthy();

    const selectorTrigger = screen.getByTestId("workspace-selector-trigger");
    fireEvent.click(selectorTrigger);

    const targetOption = await screen.findByText("Coffee Lab");
    fireEvent.click(targetOption);

    expect(screen.queryByRole("button", { name: /cámara/i })).toBeNull();
    expect(screen.getByText("Cambiando workspace…")).toBeTruthy();
    expect((screen.getByTestId("workspace-selector-trigger") as HTMLButtonElement).disabled).toBe(
      true,
    );

    resolveSetActive({});
    await waitFor(() => {
      expect(authOrgMock.setActive).toHaveBeenCalledWith({ organizationId: "org-2" });
    });
  });

  it("displays error toast and restores applications when switching workspace fails", async () => {
    authOrgMock.setActive.mockResolvedValueOnce({
      error: { message: "No eres miembro de este workspace" },
    });

    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "owner" },
            { id: "org-2", name: "Coffee Lab", slug: "coffee-lab", role: "member" },
          ],
        };
      }
      if (url === "/organizations/org-1/applications") {
        return {
          data: [{ id: "app-1", organizationId: "org-1", name: "Cámara", status: "active" }],
        };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    expect(await screen.findByRole("button", { name: /cámara/i })).toBeTruthy();

    const selectorTrigger = screen.getByTestId("workspace-selector-trigger");
    fireEvent.click(selectorTrigger);

    const targetOption = await screen.findByText("Coffee Lab");
    fireEvent.click(targetOption);

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        "No pudimos cambiar el workspace. Inténtalo de nuevo.",
      );
    });

    await waitFor(() => {
      expect((screen.getByTestId("workspace-selector-trigger") as HTMLButtonElement).disabled).toBe(
        false,
      );
    });

    expect(await screen.findByRole("button", { name: /cámara/i })).toBeTruthy();
  });

  it("displays 'Aún no perteneces a ningún workspace.' and create workspace action when user has no workspaces", async () => {
    activeOrgRef.current = null;
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return { data: [] };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    const emptyMessages = await screen.findAllByText("Aún no perteneces a ningún workspace.");
    expect(emptyMessages.length).toBeGreaterThanOrEqual(1);

    const createButtons = screen.getAllByRole("button", { name: /crear workspace/i });
    const [createButton] = createButtons;
    expect(createButton).toBeTruthy();
    if (createButton) {
      fireEvent.click(createButton);
    }
    expect(screen.getByRole("dialog", { name: "Crear workspace" })).toBeTruthy();
  });

  it("guides the user to select an active workspace when workspaces exist but none is active", async () => {
    activeOrgRef.current = null;
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
          ],
        };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    expect(await screen.findByText(/no tienes un workspace activo/i)).toBeTruthy();
    expect(screen.queryByText("Aún no perteneces a ningún workspace.")).toBeNull();
  });

  it("ignores application detail responses from a previous workspace if workspace changes while loading", async () => {
    let resolveDetail: (value: { data: unknown }) => void = () => {};
    client.get.mockImplementation((url: string) => {
      if (url === "/workspaces") {
        return Promise.resolve({
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
            { id: "org-2", name: "Nuevo Workspace", slug: "nuevo-workspace", role: "admin" },
          ],
        });
      }
      if (url === "/organizations/org-1/applications") {
        return Promise.resolve({
          data: [{ id: "app-1", organizationId: "org-1", name: "Cámara", status: "active" }],
        });
      }
      if (url === "/applications/app-1") {
        return new Promise((resolve) => {
          resolveDetail = resolve;
        });
      }
      return Promise.resolve({ data: [] });
    });

    const { rerender } = render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    expect(await screen.findByRole("button", { name: /cámara/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /cámara/i }));

    activeOrgRef.current = { id: "org-2", name: "Nuevo Workspace" };
    rerender(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    resolveDetail({
      data: { id: "app-1", organizationId: "org-1", name: "Cámara", status: "active" },
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("ID de aplicación")).toBeNull();
  });

  it("displays 'Cargando workspace…' while workspaces are loading and does not show empty state prematurely", async () => {
    activeOrgRef.current = null;
    let resolveWorkspaces: (value: { data: unknown }) => void = () => {};
    client.get.mockImplementation((url: string) => {
      if (url === "/workspaces") {
        return new Promise((resolve) => {
          resolveWorkspaces = resolve;
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    expect(screen.queryByText("Aún no perteneces a ningún workspace.")).toBeNull();
    expect(screen.getAllByText("Cargando workspace…").length).toBeGreaterThanOrEqual(1);

    resolveWorkspaces({ data: [] });
    expect(
      (await screen.findAllByText("Aún no perteneces a ningún workspace.")).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("displays error message and retry button when workspaces fail to load, and retries on click", async () => {
    activeOrgRef.current = null;
    let attempt = 0;
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        attempt++;
        if (attempt === 1) {
          throw new Error("Network error");
        }
        return { data: [{ id: "org-1", name: "BioTec", slug: "biotec", role: "owner" }] };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    expect(await screen.findByText(/No pudimos cargar los workspaces/i)).toBeTruthy();
    const retryBtn = screen.getByRole("button", { name: /reintentar/i });
    expect(retryBtn).toBeTruthy();

    fireEvent.click(retryBtn);

    const selectorTrigger = await screen.findByTestId("workspace-selector-trigger");
    fireEvent.click(selectorTrigger);
    expect(await screen.findByText("BioTec")).toBeTruthy();
  });

  it("ignores application creation responses from a previous workspace if workspace changes while in-flight", async () => {
    let resolvePost: (value: { data: unknown }) => void = () => {};
    client.post.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );

    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
            { id: "org-2", name: "Nuevo Workspace", slug: "nuevo-workspace", role: "admin" },
          ],
        };
      }
      if (url === "/organizations/org-1/applications") {
        return { data: [] };
      }
      if (url === "/organizations/org-2/applications") {
        return { data: [] };
      }
      return { data: [] };
    });

    const { rerender } = render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    const newAppBtn = await screen.findByRole("button", { name: /nueva aplicación/i });
    fireEvent.click(newAppBtn);

    const input = screen.getByLabelText("Nombre de la aplicación");
    fireEvent.change(input, { target: { value: "Sensor" } });
    const form = input.closest("form");
    expect(form).toBeTruthy();
    if (form) {
      fireEvent.submit(form);
    }
    expect(client.post).toHaveBeenCalledWith("/organizations/org-1/applications", {
      name: "Sensor",
    });

    activeOrgRef.current = { id: "org-2", name: "Nuevo Workspace" };
    rerender(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    resolvePost({
      data: { id: "app-new", organizationId: "org-1", name: "Sensor", status: "active" },
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("app-new")).toBeNull();
    expect(screen.queryByText("Creando aplicación…")).toBeNull();
  });

  it("blocks workspace switching while an application creation is in flight", async () => {
    let resolvePost: (value: { data: unknown }) => void = () => {};
    client.post.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );

    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
            { id: "org-2", name: "BioTec", slug: "biotec", role: "admin" },
          ],
        };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    const newAppBtn = await screen.findByRole("button", { name: /nueva aplicación/i });
    fireEvent.click(newAppBtn);

    const input = screen.getByLabelText("Nombre de la aplicación");
    fireEvent.change(input, { target: { value: "Sensor" } });
    const form = input.closest("form");
    expect(form).toBeTruthy();
    if (form) {
      fireEvent.submit(form);
    }
    expect(client.post).toHaveBeenCalledWith("/organizations/org-1/applications", {
      name: "Sensor",
    });

    const selectorTrigger = await screen.findByTestId("workspace-selector-trigger");
    fireEvent.click(selectorTrigger);
    const biotecOption = await screen.findByText("BioTec");
    fireEvent.click(biotecOption);
    expect(authOrgMock.setActive).not.toHaveBeenCalled();

    resolvePost({
      data: { id: "app-new", organizationId: "org-1", name: "Sensor", status: "active" },
    });

    expect(await screen.findByText("Sensor")).toBeTruthy();

    fireEvent.click(selectorTrigger);
    const retryOption = await screen.findByText("BioTec");
    fireEvent.click(retryOption);
    await waitFor(() => {
      expect(authOrgMock.setActive).toHaveBeenCalledWith({ organizationId: "org-2" });
    });
  });

  it("ignores older concurrent loadWorkspaces responses when a newer request is in-flight", async () => {
    activeOrgRef.current = null;
    let resolveFirst: (value: { data: unknown }) => void = () => {};
    let resolveSecond: (value: { data: unknown }) => void = () => {};
    let count = 0;

    authOrgMock.create.mockResolvedValue({
      data: { id: "org-2", name: "BioTec" },
    });
    authOrgMock.setActive.mockResolvedValue({});

    client.get.mockImplementation((url: string) => {
      if (url === "/workspaces") {
        count++;
        if (count === 1) {
          return new Promise((resolve) => {
            resolveFirst = resolve;
          });
        }
        return new Promise((resolve) => {
          resolveSecond = resolve;
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    const openCreateBtn = screen.getByTestId("create-workspace-trigger");
    fireEvent.click(openCreateBtn);

    const nameInput = screen.getByLabelText("Nombre del workspace");
    fireEvent.change(nameInput, { target: { value: "BioTec" } });
    const submitBtn = screen.getByTestId("create-workspace-submit");
    fireEvent.click(submitBtn);

    await waitFor(() => expect(count).toBe(2));

    resolveSecond({
      data: [{ id: "org-2", name: "BioTec", slug: "biotec", role: "owner" }],
    });

    const selectorTrigger = await screen.findByTestId("workspace-selector-trigger");
    fireEvent.click(selectorTrigger);
    expect(await screen.findByText("BioTec")).toBeTruthy();

    resolveFirst({ data: [] });

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("BioTec")).toBeTruthy();
  });

  it("disables the members navigation while there is no active workspace", async () => {
    activeOrgRef.current = null;
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
          ],
        };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    const membersBtn = await screen.findByRole("button", { name: /miembros/i });
    expect(membersBtn.hasAttribute("disabled")).toBe(true);
  });

  it("lists workspace members with their names, emails and roles in the members section", async () => {
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
          ],
        };
      }
      if (url === "/organizations/org-1/applications") {
        return { data: [] };
      }
      if (url === "/organizations/org-1/members") {
        return {
          data: [
            { id: "member-1", name: "Ana Rojas", email: "ana@biotec.io", role: "owner" },
            { id: "member-2", name: "Luis Pérez", email: "luis@biotec.io", role: "member" },
          ],
        };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /miembros/i }));

    expect(await screen.findByText("Ana Rojas")).toBeTruthy();
    expect(screen.getByText("ana@biotec.io")).toBeTruthy();
    expect(screen.getByText("Propietario")).toBeTruthy();
    expect(screen.getByText("Luis Pérez")).toBeTruthy();
    expect(screen.getByText("luis@biotec.io")).toBeTruthy();
    expect(screen.getByText("Miembro")).toBeTruthy();
  });

  it("shows 'Cargando miembros…' while the member list is in-flight", async () => {
    let resolveMembers: (value: { data: unknown }) => void = () => {};
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
          ],
        };
      }
      if (url === "/organizations/org-1/applications") {
        return { data: [] };
      }
      if (url === "/organizations/org-1/members") {
        return new Promise((resolve) => {
          resolveMembers = resolve;
        });
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /miembros/i }));

    expect(await screen.findByText("Cargando miembros…")).toBeTruthy();

    resolveMembers({
      data: [{ id: "member-1", name: "Ana Rojas", email: "ana@biotec.io", role: "member" }],
    });

    expect(await screen.findByText("Ana Rojas")).toBeTruthy();
    expect(screen.queryByText("Cargando miembros…")).toBeNull();
  });

  it("shows the members error state with retry and reloads on retry", async () => {
    let attempt = 0;
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
          ],
        };
      }
      if (url === "/organizations/org-1/applications") {
        return { data: [] };
      }
      if (url === "/organizations/org-1/members") {
        attempt++;
        if (attempt === 1) {
          throw new Error("Network error");
        }
        return {
          data: [{ id: "member-1", name: "Ana Rojas", email: "ana@biotec.io", role: "member" }],
        };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /miembros/i }));

    expect(await screen.findByText(/No pudimos cargar los miembros/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));

    expect(await screen.findByText("Ana Rojas")).toBeTruthy();
    expect(attempt).toBe(2);
  });

  it("shows the access denied message when the server refuses to reveal the workspace members", async () => {
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
          ],
        };
      }
      if (url === "/organizations/org-1/applications") {
        return { data: [] };
      }
      if (url === "/organizations/org-1/members") {
        throw {
          isAxiosError: true,
          response: {
            status: 403,
            data: { message: "No tienes acceso a este workspace." },
          },
        };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /miembros/i }));

    expect(await screen.findByText("No tienes acceso a este workspace.")).toBeTruthy();
  });

  it("shows the empty state when the workspace has no members yet", async () => {
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
          ],
        };
      }
      if (url === "/organizations/org-1/applications") {
        return { data: [] };
      }
      if (url === "/organizations/org-1/members") {
        return { data: [] };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /miembros/i }));

    expect(await screen.findByText("Este workspace aún no tiene otros miembros.")).toBeTruthy();
  });

  it("shows member actions menu and 'Cambiar rol' for manageable members when user is admin", async () => {
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
          ],
        };
      }
      if (url === "/organizations/org-1/members") {
        return {
          data: [
            { id: "member-1", name: "Ana Rojas", email: "ana@biotec.io", role: "owner" },
            { id: "member-2", name: "Luis Pérez", email: "luis@biotec.io", role: "member" },
          ],
        };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /miembros/i }));
    expect(await screen.findByText("Luis Pérez")).toBeTruthy();

    expect(screen.queryByTestId("member-menu-member-1")).toBeNull();

    const menuTrigger = screen.getByTestId("member-menu-member-2");
    expect(menuTrigger).toBeTruthy();

    fireEvent.click(menuTrigger);
    expect(await screen.findByText("Cambiar rol")).toBeTruthy();
  });

  it("does not show member actions menus when logged-in user is only a member", async () => {
    activeMemberRoleRef.current = "member";
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "member" },
          ],
        };
      }
      if (url === "/organizations/org-1/members") {
        return {
          data: [{ id: "member-2", name: "Luis Pérez", email: "luis@biotec.io", role: "member" }],
        };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /miembros/i }));
    expect(await screen.findByText("Luis Pérez")).toBeTruthy();

    expect(screen.queryByTestId("member-menu-member-2")).toBeNull();
  });

  it("opens 'Cambiar rol' dialog, updates role to admin, and displays success toast", async () => {
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
          ],
        };
      }
      if (url === "/organizations/org-1/members") {
        return {
          data: [{ id: "member-2", name: "Luis Pérez", email: "luis@biotec.io", role: "member" }],
        };
      }
      return { data: [] };
    });

    client.patch.mockResolvedValueOnce({
      data: { id: "member-2", name: "Luis Pérez", email: "luis@biotec.io", role: "admin" },
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /miembros/i }));
    expect(await screen.findByText("Luis Pérez")).toBeTruthy();

    fireEvent.click(screen.getByTestId("member-menu-member-2"));
    fireEvent.click(await screen.findByText("Cambiar rol"));

    expect(await screen.findByRole("heading", { name: "Cambiar rol" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Actualizar rol" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();

    fireEvent.pointerDown(screen.getByTestId("role-selector-trigger"), {
      button: 0,
      pointerType: "mouse",
    });
    const adminOptions = await screen.findAllByText("Administrador");
    fireEvent.click(adminOptions[0]);

    fireEvent.click(screen.getByRole("button", { name: "Actualizar rol" }));

    await waitFor(() => {
      expect(client.patch).toHaveBeenCalledWith("/organizations/org-1/members/member-2", {
        role: "admin",
      });
    });

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith("Rol actualizado.");
    });
  });

  it("handles rejection when removing the last administrator with error toast", async () => {
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
          ],
        };
      }
      if (url === "/organizations/org-1/members") {
        return {
          data: [{ id: "member-2", name: "Luis Pérez", email: "luis@biotec.io", role: "admin" }],
        };
      }
      return { data: [] };
    });

    client.patch.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { message: "El workspace debe conservar al menos un administrador." },
      },
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /miembros/i }));
    expect(await screen.findByText("Luis Pérez")).toBeTruthy();

    fireEvent.click(screen.getByTestId("member-menu-member-2"));
    fireEvent.click(await screen.findByText("Cambiar rol"));

    fireEvent.pointerDown(screen.getByTestId("role-selector-trigger"), {
      button: 0,
      pointerType: "mouse",
    });
    const memberOptions = await screen.findAllByText("Miembro");
    fireEvent.click(memberOptions[0]);

    fireEvent.click(screen.getByRole("button", { name: "Actualizar rol" }));

    await waitFor(() => {
      expect(client.patch).toHaveBeenCalledWith("/organizations/org-1/members/member-2", {
        role: "member",
      });
    });

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        "El workspace debe conservar al menos un administrador.",
      );
    });
  });

  it("handles permission rejection with specific error toast", async () => {
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
          ],
        };
      }
      if (url === "/organizations/org-1/members") {
        return {
          data: [{ id: "member-2", name: "Luis Pérez", email: "luis@biotec.io", role: "member" }],
        };
      }
      return { data: [] };
    });

    client.patch.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 403,
        data: { message: "No tienes permiso para cambiar roles en este workspace." },
      },
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /miembros/i }));
    expect(await screen.findByText("Luis Pérez")).toBeTruthy();

    fireEvent.click(screen.getByTestId("member-menu-member-2"));
    fireEvent.click(await screen.findByText("Cambiar rol"));

    fireEvent.click(screen.getByRole("button", { name: "Actualizar rol" }));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        "No tienes permiso para cambiar roles en este workspace.",
      );
    });
  });
});
