// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

const { client, activeOrgRef, authOrgMock, toastMock } = vi.hoisted(() => ({
  client: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  activeOrgRef: {
    current: { id: "org-1", name: "Laboratorio Andino" } as { id: string; name: string } | null,
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
    useActiveMemberRole: () => ({ data: { role: "admin" } }),
    organization: authOrgMock,
  },
}));
vi.mock("@/lib/http-client", () => ({ httpClient: client }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("./dashboard.css", () => ({}));

beforeAll(() => {
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
    activeOrgRef.current = { id: "org-1", name: "Laboratorio Andino" };
    authOrgMock.create.mockResolvedValue({
      data: { id: "org-new", name: "BioTec", slug: "biotec-12345" },
    });
    authOrgMock.setActive.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  it("lists workspace applications and opens their protected detail", async () => {
    client.get
      .mockResolvedValueOnce({
        data: [{ id: "app-1", organizationId: "org-1", name: "Cámara", status: "active" }],
      })
      .mockResolvedValueOnce({
        data: { id: "app-1", organizationId: "org-1", name: "Cámara", status: "active" },
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
    client.get.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstRequest = resolve;
      }),
    );

    const { rerender } = render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    activeOrgRef.current = { id: "org-2", name: "Nuevo Workspace" };
    client.get.mockResolvedValueOnce({
      data: [{ id: "app-2", organizationId: "org-2", name: "App Dos", status: "active" }],
    });

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

    resolveCreate({ data: { id: "org-xyz" } });
    await waitFor(() => expect((cancelBtn as HTMLButtonElement).disabled).toBe(false));
  });

  it("creates a new workspace, calls Better Auth, sets it as active, and confirms success", async () => {
    activeOrgRef.current = null;
    authOrgMock.create.mockResolvedValueOnce({
      data: { id: "org-new", name: "BioTec", slug: "biotec-12345" },
    });
    authOrgMock.setActive.mockResolvedValueOnce({});

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
    client.get.mockResolvedValueOnce({ data: [] });

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

  it("keeps the dialog open and displays an error if workspace activation fails", async () => {
    activeOrgRef.current = null;
    authOrgMock.create.mockResolvedValueOnce({
      data: { id: "org-new", name: "BioTec", slug: "biotec-12345" },
    });
    authOrgMock.setActive.mockResolvedValueOnce({
      error: { message: "Error al activar el workspace" },
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
    expect((screen.getByLabelText("Nombre del workspace") as HTMLInputElement).value).toBe(
      "BioTec",
    );
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
});
