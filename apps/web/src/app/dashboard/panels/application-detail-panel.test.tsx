// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Application } from "../types";
import { ApplicationDetailPanel } from "./application-detail-panel";

const { client, toastMock, writeTextMock } = vi.hoisted(() => ({
  client: { post: vi.fn(), patch: vi.fn() },
  toastMock: { success: vi.fn(), error: vi.fn() },
  writeTextMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/http-client", () => ({ httpClient: client }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) =>
      React.createElement("a", { href, ...rest }, children),
  };
});

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
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

describe("ApplicationDetailPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.post.mockReset();
    client.patch.mockReset();
    document.body.innerHTML = "";
    document.body.removeAttribute("data-scroll-locked");
    document.body.removeAttribute("style");
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    document.body.removeAttribute("data-scroll-locked");
    document.body.removeAttribute("style");
  });

  const activeApp: Application = {
    id: "app-1",
    organizationId: "org-1",
    name: "Cámara",
    status: "active",
  };

  const archivedApp: Application = {
    id: "app-2",
    organizationId: "org-1",
    name: "Sensores",
    status: "archived",
  };

  it("renders overview sections with links to each application area", () => {
    render(
      <TooltipProvider>
        <ApplicationDetailPanel
          application={activeApp}
          workspaceName="Laboratorio Andino"
          canManage={true}
          onApplicationUpdated={vi.fn()}
          onApplicationArchived={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("Workflows")).toBeTruthy();
    expect(screen.getByText("0 workflows configurados")).toBeTruthy();
    expect(screen.getByText("Modelos")).toBeTruthy();
    expect(screen.getByText("0 modelos registrados")).toBeTruthy();
    expect(screen.getByText("Credenciales SDK")).toBeTruthy();
    expect(screen.getByText("Configuración")).toBeTruthy();
    expect(screen.getByText("Activa")).toBeTruthy();
    expect(screen.getByText("Datasets")).toBeTruthy();
    expect(screen.getByText("Telemetría")).toBeTruthy();

    expect(screen.queryByRole("button", { name: /aplicaciones/i })).toBeNull();
    expect(screen.queryByText("ID de aplicación")).toBeNull();
  });

  it("renames application via dialog", async () => {
    const onUpdated = vi.fn();
    client.patch.mockResolvedValueOnce({
      data: { ...activeApp, name: "Cámara HD" },
    });

    render(
      <TooltipProvider>
        <ApplicationDetailPanel
          application={activeApp}
          workspaceName="Laboratorio Andino"
          canManage={true}
          activeSection="settings"
          onBack={vi.fn()}
          onApplicationUpdated={onUpdated}
          onApplicationArchived={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /editar nombre/i }));
    expect(screen.getByRole("dialog", { name: "Editar nombre de la aplicación" })).toBeTruthy();

    const input = screen.getByLabelText("Nombre de la aplicación");
    fireEvent.change(input, { target: { value: "Cámara HD" } });

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(client.patch).toHaveBeenCalledWith("/applications/app-1", { name: "Cámara HD" });
      expect(toastMock.success).toHaveBeenCalledWith("Nombre actualizado.");
      expect(onUpdated).toHaveBeenCalledWith({ ...activeApp, name: "Cámara HD" });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("archives active application after confirmation", async () => {
    const onArchived = vi.fn();
    client.post.mockResolvedValueOnce({
      data: { ...activeApp, status: "archived" },
    });

    render(
      <TooltipProvider>
        <ApplicationDetailPanel
          application={activeApp}
          workspaceName="Laboratorio Andino"
          canManage={true}
          activeSection="settings"
          onBack={vi.fn()}
          onApplicationUpdated={vi.fn()}
          onApplicationArchived={onArchived}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /archivar aplicación/i }));
    const dialog = await screen.findByRole("dialog", { name: /¿archivar "cámara"\?/i });
    expect(dialog).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Archivar aplicación" }));

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith("/applications/app-1/archive");
      expect(toastMock.success).toHaveBeenCalledWith("Aplicación archivada.");
      expect(onArchived).toHaveBeenCalledWith({ ...activeApp, status: "archived" });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("generates SDK credential and copies secret", async () => {
    client.post.mockResolvedValueOnce({
      data: { credential: { id: "cred-1", applicationId: "app-1", secret: "ayni_secret_abc123" } },
    });

    render(
      <TooltipProvider>
        <ApplicationDetailPanel
          application={activeApp}
          workspaceName="Laboratorio Andino"
          canManage={true}
          activeSection="credentials"
          onBack={vi.fn()}
          onApplicationUpdated={vi.fn()}
          onApplicationArchived={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByTestId("generate-credential-trigger"));
    expect(screen.getByRole("dialog", { name: "Generar credencial SDK" })).toBeTruthy();

    const submitBtn = screen.getByTestId("generate-credential-submit");
    const form = submitBtn.closest("form");
    if (form) fireEvent.submit(form);
    else fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith("/applications/app-1/sdk-credentials");
      expect(toastMock.success).toHaveBeenCalledWith("Credencial generada.");
      expect(screen.getByTestId("credential-secret").textContent).toBe("ayni_secret_abc123");
    });

    fireEvent.click(screen.getByTestId("copy-credential-inline"));
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("ayni_secret_abc123");
    });

    fireEvent.click(screen.getByTestId("copy-credential"));
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("ayni_secret_abc123");
      expect(toastMock.success).toHaveBeenCalledWith("Credencial copiada.");
    });
  });

  describe("US-012: Registrar modelo TensorFlow Lite", () => {
    it("allows admin to register a TensorFlow Lite model with required name validation", async () => {
      client.post.mockResolvedValueOnce({
        data: {
          id: "mod-1",
          applicationId: "app-1",
          name: "Detector de plagas",
          runtime: "tensorflow_lite",
        },
      });

      render(
        <TooltipProvider>
          <ApplicationDetailPanel
            application={activeApp}
            workspaceName="Laboratorio Andino"
            canManage={true}
            activeSection="models"
            onBack={vi.fn()}
            onApplicationUpdated={vi.fn()}
            onApplicationArchived={vi.fn()}
          />
        </TooltipProvider>,
      );

      fireEvent.click(screen.getByTestId("register-model-trigger"));
      expect(screen.getByRole("dialog", { name: "Registrar modelo" })).toBeTruthy();

      // Submit without name -> validation error
      fireEvent.click(screen.getByTestId("register-model-submit"));
      expect(await screen.findByText("Ingresa un nombre para el modelo.")).toBeTruthy();
      expect(client.post).not.toHaveBeenCalled();

      // Type name and submit
      const input = screen.getByLabelText("Nombre del modelo");
      fireEvent.change(input, { target: { value: "Detector de plagas" } });
      const submitBtn = screen.getByTestId("register-model-submit");
      const form = submitBtn.closest("form");
      if (form) fireEvent.submit(form);
      else fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(client.post).toHaveBeenCalledWith("/applications/app-1/models", {
          name: "Detector de plagas",
          runtime: "tensorflow_lite",
        });
        expect(toastMock.success).toHaveBeenCalledWith("Modelo registrado.");
      });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    });

    it("hides model registration for archived applications and non-admins", () => {
      render(
        <TooltipProvider>
          <ApplicationDetailPanel
            application={archivedApp}
            workspaceName="Laboratorio Andino"
            canManage={true}
            activeSection="models"
            onBack={vi.fn()}
            onApplicationUpdated={vi.fn()}
            onApplicationArchived={vi.fn()}
          />
        </TooltipProvider>,
      );

      expect(screen.queryByTestId("register-model-trigger")).toBeNull();
      cleanup();

      render(
        <TooltipProvider>
          <ApplicationDetailPanel
            application={activeApp}
            workspaceName="Laboratorio Andino"
            canManage={false}
            activeSection="models"
            onBack={vi.fn()}
            onApplicationUpdated={vi.fn()}
            onApplicationArchived={vi.fn()}
          />
        </TooltipProvider>,
      );

      expect(screen.queryByTestId("register-model-trigger")).toBeNull();
    });

    it("hides credential generation for archived applications and non-admins", () => {
      render(
        <TooltipProvider>
          <ApplicationDetailPanel
            application={archivedApp}
            workspaceName="Laboratorio Andino"
            canManage={true}
            activeSection="credentials"
            onBack={vi.fn()}
            onApplicationUpdated={vi.fn()}
            onApplicationArchived={vi.fn()}
          />
        </TooltipProvider>,
      );

      expect(screen.queryByTestId("generate-credential-trigger")).toBeNull();
      cleanup();

      render(
        <TooltipProvider>
          <ApplicationDetailPanel
            application={activeApp}
            workspaceName="Laboratorio Andino"
            canManage={false}
            activeSection="credentials"
            onBack={vi.fn()}
            onApplicationUpdated={vi.fn()}
            onApplicationArchived={vi.fn()}
          />
        </TooltipProvider>,
      );

      expect(screen.queryByTestId("generate-credential-trigger")).toBeNull();
    });
  });
});
