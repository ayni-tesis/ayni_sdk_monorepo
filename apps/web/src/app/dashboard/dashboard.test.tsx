// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

const { client, activeOrgRef, activeRoleRef, authOrgMock, toastMock, writeTextMock } = vi.hoisted(
  () => ({
    client: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
    activeOrgRef: {
      current: { id: "org-1", name: "Laboratorio Andino" } as { id: string; name: string } | null,
    },
    activeRoleRef: { current: "admin" },
    authOrgMock: {
      create: vi.fn(),
      setActive: vi.fn(),
    },
    toastMock: {
      success: vi.fn(),
      error: vi.fn(),
    },
    writeTextMock: vi.fn().mockResolvedValue(undefined),
  }),
);

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useActiveOrganization: () => ({ data: activeOrgRef.current, isPending: false }),
    useActiveMemberRole: () => ({ data: { role: activeRoleRef.current } }),
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

import Dashboard from "./dashboard";

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeOrgRef.current = { id: "org-1", name: "Laboratorio Andino" };
    activeRoleRef.current = "admin";
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
    const anaRow = screen.getByText("Ana Rojas").closest("li") as HTMLElement;
    const luisRow = screen.getByText("Luis Pérez").closest("li") as HTMLElement;
    expect(within(anaRow).getByText("ana@biotec.io")).toBeTruthy();
    expect(within(anaRow).getByText("Propietario")).toBeTruthy();
    expect(within(luisRow).getByText("luis@biotec.io")).toBeTruthy();
    expect(within(luisRow).getByText("Miembro")).toBeTruthy();
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

  async function renderOpenMembersView(members: unknown[] = []) {
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [
            { id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role: "admin" },
          ],
        };
      }
      if (url === "/organizations/org-1/members") {
        return { data: members };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /miembros/i }));
  }

  it("removes a member after explicit confirmation", async () => {
    client.delete.mockResolvedValue({ data: { message: "Miembro retirado." } });
    await renderOpenMembersView([
      { id: "member-1", name: "Ana Rojas", email: "ana@biotec.io", role: "owner" },
      { id: "member-2", name: "Luis Pérez", email: "luis@biotec.io", role: "member" },
    ]);

    expect(await screen.findByText("Ana Rojas")).toBeTruthy();

    fireEvent.click(await screen.findByTestId("member-menu-member-2"));
    fireEvent.click(await screen.findByText("Retirar miembro"));

    expect(await screen.findByText("¿Retirar a este miembro del workspace?")).toBeTruthy();
    expect(
      screen.getByText("Perderá el acceso a las aplicaciones y recursos de este workspace."),
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId("confirm-remove-member"));

    await waitFor(() => {
      expect(client.delete).toHaveBeenCalledWith("/organizations/org-1/members/member-2");
    });
    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith("Miembro retirado.");
    });
    await waitFor(() => {
      expect(screen.queryByText("Luis Pérez")).toBeNull();
    });
    expect(screen.getByText("Ana Rojas")).toBeTruthy();
  });

  it("keeps the confirmation dialog open while the removal is in flight", async () => {
    let resolveDelete: (value: unknown) => void = () => {};
    client.delete.mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve;
      }),
    );
    await renderOpenMembersView([
      { id: "member-2", name: "Luis Pérez", email: "luis@biotec.io", role: "member" },
    ]);

    expect(await screen.findByText("Luis Pérez")).toBeTruthy();

    fireEvent.click(await screen.findByTestId("member-menu-member-2"));
    fireEvent.click(await screen.findByText("Retirar miembro"));

    expect(await screen.findByText("¿Retirar a este miembro del workspace?")).toBeTruthy();

    fireEvent.click(screen.getByTestId("confirm-remove-member"));
    expect(screen.getByRole("button", { name: /retirando miembro…/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByRole("dialog")).toBeTruthy();

    resolveDelete({ data: { message: "Miembro retirado." } });

    await waitFor(() => {
      expect(screen.queryByText("¿Retirar a este miembro del workspace?")).toBeNull();
    });
  });

  it("shows the permission message when the server refuses to remove the member", async () => {
    client.delete.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 403,
        data: { message: "No tienes permiso para retirar miembros de este workspace." },
      },
    });
    await renderOpenMembersView([
      { id: "member-2", name: "Luis Pérez", email: "luis@biotec.io", role: "member" },
    ]);

    expect(await screen.findByText("Luis Pérez")).toBeTruthy();

    fireEvent.click(await screen.findByTestId("member-menu-member-2"));
    fireEvent.click(await screen.findByText("Retirar miembro"));

    fireEvent.click(await screen.findByTestId("confirm-remove-member"));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        "No tienes permiso para retirar miembros de este workspace.",
      );
    });
    expect(screen.getByText("Luis Pérez")).toBeTruthy();
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
    activeRoleRef.current = "member";
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
    fireEvent.click(await screen.findByTestId("role-option-admin"));

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
    fireEvent.click(await screen.findByTestId("role-option-member"));

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

  it("lets admins open the invitation dialog with a role selector", async () => {
    await renderOpenMembersView();

    fireEvent.click(await screen.findByRole("button", { name: /crear enlace de invitación/i }));

    expect(screen.getByRole("dialog", { name: "Crear enlace de invitación" })).toBeTruthy();
    const roleSelect = screen.getByLabelText("Rol") as HTMLSelectElement;
    expect(screen.getByRole("option", { name: "Administrador" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Miembro" })).toBeTruthy();
    expect(roleSelect.value).toBe("member");
  });

  it("creates an invitation link and shows a copyable URL", async () => {
    await renderOpenMembersView();
    client.post.mockImplementation(async () => ({
      data: {
        invitation: {
          id: "inv-1",
          token: "tok-123",
          organizationId: "org-1",
          role: "member",
          expiresAt: "2026-10-01T00:00:00.000Z",
        },
      },
    }));

    fireEvent.click(await screen.findByRole("button", { name: /crear enlace de invitación/i }));
    fireEvent.click(screen.getByRole("button", { name: /^crear enlace$/i }));

    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith("/organizations/org-1/invitation-links", {
        role: "member",
      }),
    );
    expect(await screen.findByText((text) => text.includes("/join?token=tok-123"))).toBeTruthy();
    expect(toastMock.success).toHaveBeenCalledWith("Enlace de invitación creado.");

    fireEvent.click(screen.getByRole("button", { name: /copiar enlace/i }));
    await waitFor(() =>
      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("/join?token=tok-123")),
    );
  });

  it("sends the role selected by the admin", async () => {
    await renderOpenMembersView();
    client.post.mockResolvedValue({
      data: {
        invitation: {
          id: "inv-1",
          token: "tok-456",
          organizationId: "org-1",
          role: "admin",
          expiresAt: "2026-10-01T00:00:00.000Z",
        },
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: /crear enlace de invitación/i }));
    fireEvent.change(screen.getByLabelText("Rol"), { target: { value: "admin" } });
    fireEvent.click(screen.getByRole("button", { name: /^crear enlace$/i }));

    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith("/organizations/org-1/invitation-links", {
        role: "admin",
      }),
    );
  });

  it("shows 'Creando enlace…' while the invitation request is in flight", async () => {
    await renderOpenMembersView();
    let resolveCreate: (value: unknown) => void = () => {};
    client.post.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: /crear enlace de invitación/i }));
    fireEvent.click(screen.getByRole("button", { name: /^crear enlace$/i }));

    expect(screen.getByRole("button", { name: /creando enlace…/i }).hasAttribute("disabled")).toBe(
      true,
    );

    resolveCreate({
      data: {
        invitation: {
          id: "inv-1",
          token: "tok-789",
          organizationId: "org-1",
          role: "member",
          expiresAt: "2026-10-01T00:00:00.000Z",
        },
      },
    });
    expect(await screen.findByText((text) => text.includes("/join?token=tok-789"))).toBeTruthy();
  });

  it("surfaces the permission error returned by the server", async () => {
    await renderOpenMembersView();
    client.post.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 403,
        data: { message: "No tienes permiso para crear invitaciones en este workspace." },
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: /crear enlace de invitación/i }));
    fireEvent.click(screen.getByRole("button", { name: /^crear enlace$/i }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "No tienes permiso para crear invitaciones en este workspace.",
      ),
    );
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("shows the retry-friendly error when the invitation request fails unexpectedly", async () => {
    await renderOpenMembersView();
    client.post.mockRejectedValue(new Error("Network error"));

    fireEvent.click(await screen.findByRole("button", { name: /crear enlace de invitación/i }));
    fireEvent.click(screen.getByRole("button", { name: /^crear enlace$/i }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "No pudimos crear el enlace. Inténtalo de nuevo.",
      ),
    );
    expect(screen.queryByText((text) => text.includes("/join?token="))).toBeNull();
  });

  it("hides the invitation link action for members without admin permissions", async () => {
    activeRoleRef.current = "member";
    await renderOpenMembersView();

    expect(screen.queryByRole("button", { name: /crear enlace de invitación/i })).toBeNull();
  });

  async function renderOpenApplicationDetail({
    status = "active",
    role = "admin",
  }: {
    status?: "active" | "archived";
    role?: string;
  } = {}) {
    activeRoleRef.current = role;
    client.post.mockReset();
    client.get.mockImplementation(async (url: string) => {
      if (url === "/workspaces") {
        return {
          data: [{ id: "org-1", name: "Laboratorio Andino", slug: "laboratorio-andino", role }],
        };
      }
      if (url === "/organizations/org-1/applications") {
        return { data: [{ id: "app-1", organizationId: "org-1", name: "Cámara", status }] };
      }
      if (url === "/applications/app-1") {
        return { data: { id: "app-1", organizationId: "org-1", name: "Cámara", status } };
      }
      return { data: [] };
    });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /cámara/i }));
    await screen.findByText("ID de aplicación");
  }

  it("generates an SDK credential from the application detail and shows the secret once", async () => {
    await renderOpenApplicationDetail();
    client.post.mockResolvedValueOnce({
      data: {
        credential: {
          id: "cred-1",
          applicationId: "app-1",
          secret: "ayni_sk_abcd1234secret",
        },
      },
    });

    fireEvent.click(screen.getByTestId("generate-credential-trigger"));

    expect(screen.getByRole("heading", { name: "Generar credencial SDK" })).toBeTruthy();
    expect(
      screen.getByText("El secreto se mostrará una sola vez. Guárdalo en un lugar seguro."),
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId("generate-credential-submit"));

    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith("/applications/app-1/sdk-credentials"),
    );
    expect(
      await screen.findByText("Copia tu credencial ahora. No podrás verla nuevamente."),
    ).toBeTruthy();
    expect(screen.getByTestId("credential-secret").textContent).toBe("ayni_sk_abcd1234secret");
    expect(toastMock.success).toHaveBeenCalledWith("Credencial generada.");
  });

  it("copies the generated credential to the clipboard", async () => {
    await renderOpenApplicationDetail();
    client.post.mockResolvedValueOnce({
      data: {
        credential: {
          id: "cred-1",
          applicationId: "app-1",
          secret: "ayni_sk_abcd1234secret",
        },
      },
    });

    fireEvent.click(screen.getByTestId("generate-credential-trigger"));
    fireEvent.click(screen.getByTestId("generate-credential-submit"));

    fireEvent.click(await screen.findByTestId("copy-credential"));

    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith("ayni_sk_abcd1234secret"));
    expect(toastMock.success).toHaveBeenCalledWith("Credencial copiada.");
  });

  it("shows 'Generando credencial…' while the credential request is in flight", async () => {
    await renderOpenApplicationDetail();
    let resolveCreate: (value: unknown) => void = () => {};
    client.post.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );

    fireEvent.click(screen.getByTestId("generate-credential-trigger"));
    fireEvent.click(screen.getByTestId("generate-credential-submit"));

    expect(
      screen.getByRole("button", { name: /generando credencial…/i }).hasAttribute("disabled"),
    ).toBe(true);

    resolveCreate({
      data: {
        credential: {
          id: "cred-1",
          applicationId: "app-1",
          secret: "ayni_sk_abcd1234secret",
        },
      },
    });

    expect(
      await screen.findByText("Copia tu credencial ahora. No podrás verla nuevamente."),
    ).toBeTruthy();
  });

  it("does not offer generating credentials to workspace members", async () => {
    await renderOpenApplicationDetail({ role: "member" });

    expect(screen.queryByTestId("generate-credential-trigger")).toBeNull();
  });

  it("does not offer generating credentials for archived applications", async () => {
    await renderOpenApplicationDetail({ status: "archived" });

    expect(screen.queryByTestId("generate-credential-trigger")).toBeNull();
  });

  it("surfaces the applicationArchived rejection from the server", async () => {
    await renderOpenApplicationDetail();
    client.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          message: "No puedes generar credenciales para una aplicación archivada.",
          code: "applicationArchived",
        },
      },
    });

    fireEvent.click(screen.getByTestId("generate-credential-trigger"));
    fireEvent.click(screen.getByTestId("generate-credential-submit"));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "No puedes generar credenciales para una aplicación archivada.",
      ),
    );
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(screen.queryByTestId("credential-secret")).toBeNull();
  });

  it("surfaces the permission rejection from the server", async () => {
    await renderOpenApplicationDetail();
    client.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 403,
        data: { message: "No tienes permiso para administrar credenciales." },
      },
    });

    fireEvent.click(screen.getByTestId("generate-credential-trigger"));
    fireEvent.click(screen.getByTestId("generate-credential-submit"));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "No tienes permiso para administrar credenciales.",
      ),
    );
  });

  it("requires an explicit close before discarding the generated secret", async () => {
    await renderOpenApplicationDetail();
    client.post.mockResolvedValueOnce({
      data: {
        credential: {
          id: "cred-1",
          applicationId: "app-1",
          secret: "ayni_sk_abcd1234secret",
        },
      },
    });

    fireEvent.click(screen.getByTestId("generate-credential-trigger"));
    fireEvent.click(screen.getByTestId("generate-credential-submit"));

    expect(
      await screen.findByText("Copia tu credencial ahora. No podrás verla nuevamente."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();

    fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
    expect(screen.getByTestId("credential-secret")).toBeTruthy();

    fireEvent.click(screen.getByTestId("close-credential"));
    await waitFor(() => expect(screen.queryByTestId("credential-secret")).toBeNull());

    fireEvent.click(screen.getByTestId("generate-credential-trigger"));
    expect(
      screen.getByText("El secreto se mostrará una sola vez. Guárdalo en un lugar seguro."),
    ).toBeTruthy();
    expect(screen.queryByTestId("credential-secret")).toBeNull();
  });

  describe("US-012: Registrar modelo TensorFlow Lite", () => {
    it("allows an administrator to register a TensorFlow Lite model for an active application", async () => {
      await renderOpenApplicationDetail();
      client.post.mockResolvedValueOnce({
        data: {
          model: {
            id: "model-1",
            applicationId: "app-1",
            name: "Detector de roya",
            runtime: "tensorflow_lite",
            createdAt: "2026-09-19T20:00:00.000Z",
            updatedAt: "2026-09-19T20:00:00.000Z",
          },
        },
      });

      fireEvent.click(screen.getByTestId("register-model-trigger"));

      expect(screen.getByRole("heading", { name: "Registrar modelo" })).toBeTruthy();
      const runtimeInput = screen.getByLabelText(/runtime/i);
      expect(runtimeInput).toBeTruthy();
      expect(runtimeInput.getAttribute("value")).toBe("TensorFlow Lite");
      expect(runtimeInput.hasAttribute("disabled") || runtimeInput.hasAttribute("readonly")).toBe(
        true,
      );

      const nameInput = screen.getByLabelText(/nombre del modelo/i);
      fireEvent.change(nameInput, { target: { value: "Detector de roya" } });

      fireEvent.click(screen.getByTestId("register-model-submit"));

      await waitFor(() =>
        expect(client.post).toHaveBeenCalledWith("/applications/app-1/models", {
          name: "Detector de roya",
          runtime: "tensorflow_lite",
        }),
      );
      expect(toastMock.success).toHaveBeenCalledWith("Modelo registrado.");
      await waitFor(() =>
        expect(screen.queryByRole("heading", { name: "Registrar modelo" })).toBeNull(),
      );
    });

    it("shows validation error 'Ingresa un nombre para el modelo.' when attempting to submit without a name", async () => {
      await renderOpenApplicationDetail();

      fireEvent.click(screen.getByTestId("register-model-trigger"));
      fireEvent.click(screen.getByTestId("register-model-submit"));

      expect(screen.getByText("Ingresa un nombre para el modelo.")).toBeTruthy();
      expect(client.post).not.toHaveBeenCalled();
    });

    it("shows 'Registrando modelo…' while the model registration request is in flight", async () => {
      await renderOpenApplicationDetail();
      let resolveCreate: (value: unknown) => void = () => {};
      client.post.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
      );

      fireEvent.click(screen.getByTestId("register-model-trigger"));
      const nameInput = screen.getByLabelText(/nombre del modelo/i);
      fireEvent.change(nameInput, { target: { value: "Detector de roya" } });
      fireEvent.click(screen.getByTestId("register-model-submit"));

      expect(
        screen.getByRole("button", { name: /registrando modelo…/i }).hasAttribute("disabled"),
      ).toBe(true);

      resolveCreate({
        data: {
          model: {
            id: "model-1",
            applicationId: "app-1",
            name: "Detector de roya",
            runtime: "tensorflow_lite",
          },
        },
      });

      await waitFor(() =>
        expect(screen.queryByRole("heading", { name: "Registrar modelo" })).toBeNull(),
      );
    });

    it("does not offer registering models to workspace members", async () => {
      await renderOpenApplicationDetail({ role: "member" });

      expect(screen.queryByTestId("register-model-trigger")).toBeNull();
    });

    it("does not offer registering models for archived applications", async () => {
      await renderOpenApplicationDetail({ status: "archived" });

      expect(screen.queryByTestId("register-model-trigger")).toBeNull();
    });

    it("surfaces the applicationArchived rejection from the server when registering a model", async () => {
      await renderOpenApplicationDetail();
      client.post.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 409,
          data: {
            message: "No puedes registrar modelos en una aplicación archivada.",
            code: "applicationArchived",
          },
        },
      });

      fireEvent.click(screen.getByTestId("register-model-trigger"));
      const nameInput = screen.getByLabelText(/nombre del modelo/i);
      fireEvent.change(nameInput, { target: { value: "Detector de roya" } });
      fireEvent.click(screen.getByTestId("register-model-submit"));

      await waitFor(() =>
        expect(toastMock.error).toHaveBeenCalledWith(
          "No puedes registrar modelos en una aplicación archivada.",
        ),
      );
      expect(toastMock.success).not.toHaveBeenCalled();
    });

    it("surfaces the permission rejection from the server when registering a model", async () => {
      await renderOpenApplicationDetail();
      client.post.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 403,
          data: { message: "No tienes permiso para registrar modelos." },
        },
      });

      fireEvent.click(screen.getByTestId("register-model-trigger"));
      const nameInput = screen.getByLabelText(/nombre del modelo/i);
      fireEvent.change(nameInput, { target: { value: "Detector de roya" } });
      fireEvent.click(screen.getByTestId("register-model-submit"));

      await waitFor(() =>
        expect(toastMock.error).toHaveBeenCalledWith("No tienes permiso para registrar modelos."),
      );
    });

    it("resets form and error when canceling dialog", async () => {
      await renderOpenApplicationDetail();

      fireEvent.click(screen.getByTestId("register-model-trigger"));
      fireEvent.click(screen.getByTestId("register-model-submit"));
      expect(screen.getByText("Ingresa un nombre para el modelo.")).toBeTruthy();

      const nameInput = screen.getByLabelText(/nombre del modelo/i);
      fireEvent.change(nameInput, { target: { value: "Detector" } });

      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      await waitFor(() =>
        expect(screen.queryByRole("heading", { name: "Registrar modelo" })).toBeNull(),
      );

      fireEvent.click(screen.getByTestId("register-model-trigger"));
      expect(screen.queryByText("Ingresa un nombre para el modelo.")).toBeNull();
      const reopenedInput = screen.getByLabelText(/nombre del modelo/i);
      expect((reopenedInput as HTMLInputElement).value).toBe("");
    });
  });
});
