// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Application } from "../types";
import { ApplicationDetailPanel } from "./application-detail-panel";

const { client, toastMock, writeTextMock } = vi.hoisted(() => ({
  client: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
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
    client.get.mockReset();
    client.post.mockReset();
    client.patch.mockReset();
    client.get.mockImplementation(async () => ({ data: { models: [] } }));
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

    it("lists models and opens the upload dialog per model", async () => {
      client.get.mockImplementation(async (url: string) => {
        if (url === "/applications/app-1/models") {
          return {
            data: {
              models: [
                {
                  id: "model-1",
                  applicationId: "app-1",
                  name: "Detector de plagas",
                  runtime: "tensorflow_lite",
                  createdAt: "2026-09-19T20:00:00.000Z",
                  updatedAt: "2026-09-19T20:00:00.000Z",
                },
              ],
            },
          };
        }
        return { data: { models: [] } };
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

      expect(await screen.findByTestId("model-row-model-1")).toBeTruthy();
      fireEvent.click(screen.getByTestId("upload-version-trigger-model-1"));

      const dialog = await screen.findByRole("dialog", { name: "Subir versión de modelo" });
      expect(within(dialog).getByText("Para Detector de plagas.")).toBeTruthy();
      expect(within(dialog).getByLabelText("Versión")).toBeTruthy();
      expect(within(dialog).getByLabelText("Archivo TensorFlow Lite (.tflite)")).toBeTruthy();
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

  describe("US-014: Listar los modelos de una aplicación", () => {
    const listedModel = {
      id: "model-1",
      applicationId: "app-1",
      name: "Detector de plagas",
      runtime: "tensorflow_lite",
      versionCount: 3,
      createdAt: "2026-09-19T20:00:00.000Z",
      updatedAt: "2026-09-19T20:00:00.000Z",
    };

    it("lets a plain member list models with Nombre, ID, Runtime and Versiones", async () => {
      client.get.mockImplementation(async () => ({ data: { models: [listedModel] } }));

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

      const table = await screen.findByTestId("models-table");
      expect(
        within(table)
          .getAllByRole("columnheader")
          .map((header) => header.textContent),
      ).toEqual(["Nombre", "ID", "Runtime", "Versiones"]);

      const row = within(table).getByTestId("model-row-model-1");
      expect(within(row).getByText("Detector de plagas")).toBeTruthy();
      expect(within(row).getByText("model-1")).toBeTruthy();
      expect(within(row).getByText("TensorFlow Lite")).toBeTruthy();
      expect(within(row).getByText("3")).toBeTruthy();

      expect(screen.queryByTestId("register-model-trigger")).toBeNull();
      expect(screen.queryByTestId("upload-version-trigger-model-1")).toBeNull();
    });

    it("shows the admin registration trigger next to the listing with an Acciones column", async () => {
      client.get.mockImplementation(async () => ({ data: { models: [listedModel] } }));

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

      const table = await screen.findByTestId("models-table");
      expect(
        within(table)
          .getAllByRole("columnheader")
          .map((header) => header.textContent),
      ).toEqual(["Nombre", "ID", "Runtime", "Versiones", "Acciones"]);
      expect(screen.getByTestId("register-model-trigger")).toBeTruthy();
    });

    it("shows a zero version count for a model without published versions", async () => {
      client.get.mockImplementation(async () => ({
        data: { models: [{ ...listedModel, versionCount: 0 }] },
      }));

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

      const row = await screen.findByTestId("model-row-model-1");
      expect(within(row).getByText("0")).toBeTruthy();
    });

    it("shows the empty state when the application has no models", async () => {
      client.get.mockImplementation(async () => ({ data: { models: [] } }));

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

      const empty = await screen.findByTestId("models-empty");
      expect(empty.textContent).toBe("Aún no hay modelos registrados en esta aplicación.");
      expect(screen.queryByTestId("models-table")).toBeNull();
    });

    it("shows the loading state while models are being fetched", async () => {
      let resolveModels: (value: unknown) => void = () => {};

      client.get.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveModels = resolve;
          }),
      );

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

      const loading = await screen.findByTestId("models-loading");
      expect(loading.textContent).toBe("Cargando modelos…");

      resolveModels({ data: { models: [listedModel] } });
      expect(await screen.findByTestId("model-row-model-1")).toBeTruthy();
      expect(screen.queryByTestId("models-loading")).toBeNull();
    });

    it("shows a retryable error state when loading fails", async () => {
      let modelsCalls = 0;

      client.get.mockImplementation(() => {
        modelsCalls += 1;
        if (modelsCalls === 1) {
          throw { isAxiosError: true, response: { status: 500, data: {} } };
        }
        return { data: { models: [listedModel] } };
      });

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

      expect(
        await screen.findByText("No pudimos cargar los modelos. Inténtalo nuevamente."),
      ).toBeTruthy();
      expect(screen.queryByTestId("models-table")).toBeNull();

      fireEvent.click(screen.getByTestId("models-retry"));

      expect(await screen.findByTestId("model-row-model-1")).toBeTruthy();
      expect(modelsCalls).toBe(2);
    });

    it("surfaces the server message when a request for a foreign application is rejected", async () => {
      client.get.mockImplementation(() => {
        throw {
          isAxiosError: true,
          response: {
            status: 404,
            data: { message: "No encontramos esta aplicación." },
          },
        };
      });

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

      expect(await screen.findByText("No encontramos esta aplicación.")).toBeTruthy();
      expect(screen.queryByTestId("models-table")).toBeNull();
    });
  });

  describe("US-015: Listar las versiones de un modelo", () => {
    const versionedModel = {
      id: "model-1",
      applicationId: "app-1",
      name: "Detector de plagas",
      runtime: "tensorflow_lite",
      versionCount: 1,
      createdAt: "2026-09-19T20:00:00.000Z",
      updatedAt: "2026-09-19T20:00:00.000Z",
    };

    const versionItem = {
      id: "mv-1",
      version: "1.0.0",
      sha256: "a".repeat(64),
      sizeBytes: 2048,
      createdAt: "2026-09-20T00:00:00.000Z",
    };

    beforeEach(() => {
      client.get.mockImplementation(async (url: string) => {
        if (url === "/applications/app-1/models/model-1/versions") {
          return { data: { versions: [versionItem] } };
        }
        return { data: { models: [versionedModel] } };
      });
    });

    it("lets a plain member open the versions of a model from the listing", async () => {
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

      const row = await screen.findByTestId("model-row-model-1");
      fireEvent.click(within(row).getByTestId("versions-trigger-model-1"));

      const dialog = await screen.findByRole("dialog", {
        name: "Versiones de Detector de plagas",
      });
      expect(client.get).toHaveBeenCalledWith(
        "/applications/app-1/models/model-1/versions",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(within(dialog).getByTestId("model-version-row-mv-1")).toBeTruthy();
      expect(within(dialog).queryByTestId("upload-version-from-versions")).toBeNull();
    });

    it("offers administrators the Subir versión action inside the versions dialog", async () => {
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

      const row = await screen.findByTestId("model-row-model-1");
      fireEvent.click(within(row).getByTestId("versions-trigger-model-1"));

      const dialog = await screen.findByRole("dialog", {
        name: "Versiones de Detector de plagas",
      });
      expect(within(dialog).getByTestId("upload-version-from-versions")).toBeTruthy();
    });
  });

  describe("US-024: Crear un workflow", () => {
    function renderWorkflows({
      application = activeApp,
      canManage = true,
    }: {
      application?: Application;
      canManage?: boolean;
    } = {}) {
      return render(
        <TooltipProvider>
          <ApplicationDetailPanel
            application={application}
            workspaceName="Laboratorio Andino"
            canManage={canManage}
            activeSection="workflows"
            onBack={vi.fn()}
            onApplicationUpdated={vi.fn()}
            onApplicationArchived={vi.fn()}
          />
        </TooltipProvider>,
      );
    }

    it("lets an administrator create a draft workflow with a required name", async () => {
      client.post.mockResolvedValueOnce({
        data: {
          workflow: {
            id: "workflow-1",
            applicationId: "app-1",
            name: "Diagnóstico de hoja de café",
            status: "draft",
            createdAt: "2026-09-21T15:00:00.000Z",
            updatedAt: "2026-09-21T15:00:00.000Z",
          },
        },
      });
      renderWorkflows();

      fireEvent.click(screen.getByTestId("create-workflow-trigger"));

      const dialog = screen.getByRole("dialog", { name: "Crear workflow" });
      expect(within(dialog).getByLabelText("Nombre del workflow")).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Crear borrador" })).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeTruthy();

      fireEvent.click(screen.getByTestId("create-workflow-submit"));
      expect(await screen.findByText("Ingresa un nombre para el workflow.")).toBeTruthy();
      expect(client.post).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText("Nombre del workflow"), {
        target: { value: "  Diagnóstico de hoja de café  " },
      });
      fireEvent.click(screen.getByTestId("create-workflow-submit"));

      await waitFor(() => {
        expect(client.post).toHaveBeenCalledWith("/applications/app-1/workflows", {
          name: "Diagnóstico de hoja de café",
        });
        expect(toastMock.success).toHaveBeenCalledWith("Workflow creado. Ya puedes agregar nodos.");
      });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    });

    it("shows 'Creando borrador…' while the workflow request is in flight", async () => {
      let resolveCreate: (value: unknown) => void = () => {};
      client.post.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
      );
      renderWorkflows();

      fireEvent.click(screen.getByTestId("create-workflow-trigger"));
      fireEvent.change(screen.getByLabelText("Nombre del workflow"), {
        target: { value: "Diagnóstico" },
      });
      fireEvent.click(screen.getByTestId("create-workflow-submit"));

      expect(
        screen.getByRole("button", { name: "Creando borrador…" }).hasAttribute("disabled"),
      ).toBe(true);

      resolveCreate({ data: { workflow: { id: "workflow-1" } } });

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    });

    it("does not offer creating workflows to non-administrators", () => {
      renderWorkflows({ canManage: false });

      expect(screen.queryByTestId("create-workflow-trigger")).toBeNull();
    });

    it("does not offer creating workflows for archived applications", () => {
      renderWorkflows({ application: archivedApp });

      expect(screen.queryByTestId("create-workflow-trigger")).toBeNull();
    });

    it("surfaces the applicationArchived rejection from the server and keeps the dialog open", async () => {
      client.post.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 409,
          data: {
            message: "No puedes crear workflows en una aplicación archivada.",
            code: "applicationArchived",
          },
        },
      });
      renderWorkflows();

      fireEvent.click(screen.getByTestId("create-workflow-trigger"));
      fireEvent.change(screen.getByLabelText("Nombre del workflow"), {
        target: { value: "Diagnóstico" },
      });
      fireEvent.click(screen.getByTestId("create-workflow-submit"));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith(
          "No puedes crear workflows en una aplicación archivada.",
        );
      });
      expect(toastMock.success).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Crear workflow" })).toBeTruthy();
      expect((screen.getByLabelText("Nombre del workflow") as HTMLInputElement).value).toBe(
        "Diagnóstico",
      );
      expect(screen.getByRole("button", { name: "Crear borrador" }).hasAttribute("disabled")).toBe(
        false,
      );
    });

    it("surfaces the permission rejection from the server", async () => {
      client.post.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 403,
          data: { message: "No tienes permiso para crear workflows." },
        },
      });
      renderWorkflows();

      fireEvent.click(screen.getByTestId("create-workflow-trigger"));
      fireEvent.change(screen.getByLabelText("Nombre del workflow"), {
        target: { value: "Diagnóstico" },
      });
      fireEvent.click(screen.getByTestId("create-workflow-submit"));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith("No tienes permiso para crear workflows.");
      });
    });

    it("falls back to a generic error when the request fails without a server message", async () => {
      client.post.mockRejectedValueOnce(new Error("Network Error"));
      renderWorkflows();

      fireEvent.click(screen.getByTestId("create-workflow-trigger"));
      fireEvent.change(screen.getByLabelText("Nombre del workflow"), {
        target: { value: "Diagnóstico" },
      });
      fireEvent.click(screen.getByTestId("create-workflow-submit"));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith(
          "No pudimos crear el workflow. Inténtalo nuevamente.",
        );
      });
    });

    it("resets the form and the validation error when the dialog is cancelled", async () => {
      renderWorkflows();

      fireEvent.click(screen.getByTestId("create-workflow-trigger"));
      fireEvent.click(screen.getByTestId("create-workflow-submit"));
      expect(screen.getByText("Ingresa un nombre para el workflow.")).toBeTruthy();

      fireEvent.change(screen.getByLabelText("Nombre del workflow"), {
        target: { value: "Diagnóstico" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });

      fireEvent.click(screen.getByTestId("create-workflow-trigger"));
      expect(screen.queryByText("Ingresa un nombre para el workflow.")).toBeNull();
      expect((screen.getByLabelText("Nombre del workflow") as HTMLInputElement).value).toBe("");
      expect(client.post).not.toHaveBeenCalled();
    });
  });
});
