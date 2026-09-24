// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { formatLongDateEs } from "@/lib/format-date";
import type { Application } from "../types";
import { findWorkflowCycleNodeIds } from "./application/workflow-detail-view";
import { ApplicationDetailPanel } from "./application-detail-panel";

describe("findWorkflowCycleNodeIds", () => {
  const connection = {
    sourceNodeId: "b",
    sourcePort: "result",
    targetNodeId: "a",
    targetPort: "image",
  };
  const edge = (sourceNodeId: string, targetNodeId: string) => ({
    sourceNodeId,
    sourcePort: "result",
    targetNodeId,
    targetPort: "image",
  });

  it("finds direct and indirect cycles before posting a connection", () => {
    expect(
      findWorkflowCycleNodeIds({ nodes: [], connections: [edge("a", "b")] }, connection),
    ).toEqual(["b", "a"]);
    expect(
      findWorkflowCycleNodeIds(
        { nodes: [], connections: [edge("a", "c"), edge("c", "b")] },
        connection,
      ),
    ).toEqual(["b", "a", "c"]);
    expect(findWorkflowCycleNodeIds({ nodes: [], connections: [edge("a", "c")] }, connection)).toBe(
      undefined,
    );
  });
});

const { client, toastMock, writeTextMock } = vi.hoisted(() => ({
  client: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
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
    client.delete.mockReset();
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

  describe("US-019: Ver el detalle de un modelo", () => {
    const listedModel = {
      id: "model-1",
      applicationId: "app-1",
      name: "Detector de plagas",
      runtime: "tensorflow_lite",
      versionCount: 1,
      createdAt: "2026-09-19T20:00:00.000Z",
      updatedAt: "2026-09-20T20:00:00.000Z",
    };

    function modelDetailPanel(modelId = "model-1") {
      return (
        <TooltipProvider>
          <ApplicationDetailPanel
            application={activeApp}
            canManage={false}
            activeSection="models"
            modelId={modelId}
            onBack={vi.fn()}
            onApplicationUpdated={vi.fn()}
            onApplicationArchived={vi.fn()}
          />
        </TooltipProvider>
      );
    }

    it("shows the specified loading state while resolving the model", async () => {
      let resolveModels: (value: unknown) => void = () => {};
      let calls = 0;
      client.get.mockImplementation(() => {
        calls += 1;
        if (calls === 1)
          return new Promise((resolve) => {
            resolveModels = resolve;
          });
        return Promise.resolve({ data: { versions: [] } });
      });

      render(modelDetailPanel());

      expect((await screen.findByTestId("model-detail-loading")).textContent).toBe(
        "Cargando modelo…",
      );
      resolveModels({ data: { models: [listedModel] } });
      expect(await screen.findByTestId("model-detail-header")).toBeTruthy();
    });

    it("uses the same not-found state when the model is not in the member-visible list", async () => {
      client.get.mockResolvedValue({ data: { models: [] } });

      render(modelDetailPanel("missing-model"));

      expect((await screen.findByTestId("model-detail-not-found")).textContent).toBe(
        "No encontramos este modelo.",
      );
      expect(client.get).not.toHaveBeenCalledWith(
        "/applications/app-1/models/missing-model/versions",
        expect.anything(),
      );
    });

    it("shows a retryable error and loads the model after retry", async () => {
      let versionCalls = 0;
      client.get.mockImplementation(async (url: string) => {
        if (url.endsWith("/models")) return { data: { models: [listedModel] } };
        versionCalls += 1;
        if (versionCalls === 1) {
          throw { isAxiosError: true, response: { status: 500, data: {} } };
        }
        return { data: { versions: [] } };
      });

      render(modelDetailPanel());

      expect(
        await screen.findByText("No pudimos cargar el modelo. Inténtalo nuevamente."),
      ).toBeTruthy();
      fireEvent.click(screen.getByTestId("model-detail-retry"));
      expect(await screen.findByTestId("model-detail-header")).toBeTruthy();
      expect(versionCalls).toBe(2);
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

  describe("US-025: Listar los workflows de una aplicación", () => {
    const listedWorkflow = {
      id: "workflow-1",
      applicationId: "app-1",
      name: "Diagnóstico de hoja de café",
      status: "draft",
      createdAt: "2026-09-21T15:00:00.000Z",
      updatedAt: "2026-09-21T16:00:00.000Z",
    };

    // Records the DOM of every commit. The parent's layout effect runs before the
    // child's passive fetch effect, so it sees the frame the user could paint.
    function FrameRecorder({ frames, children }: { frames: string[]; children: ReactNode }) {
      const ref = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => {
        frames.push(ref.current?.innerHTML ?? "");
      });
      return <div ref={ref}>{children}</div>;
    }

    function workflowPanel(application: Application, canManage: boolean, frames: string[] = []) {
      return (
        <FrameRecorder frames={frames}>
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
          </TooltipProvider>
        </FrameRecorder>
      );
    }

    function renderWorkflowList({
      application = activeApp,
      canManage = false,
    }: {
      application?: Application;
      canManage?: boolean;
    } = {}) {
      return render(workflowPanel(application, canManage));
    }

    it("lets a plain member list workflows with Nombre, Estado, Última versión and Actualizado", async () => {
      client.get.mockImplementation(async () => ({ data: { workflows: [listedWorkflow] } }));

      renderWorkflowList({ canManage: false });

      const table = await screen.findByTestId("workflows-table");
      expect(
        within(table)
          .getAllByRole("columnheader")
          .map((header) => header.textContent),
      ).toEqual(["Nombre", "Estado", "Última versión", "Actualizado"]);

      const row = within(table).getByTestId("workflow-row-workflow-1");
      expect(within(row).getByText("Diagnóstico de hoja de café")).toBeTruthy();
      expect(within(row).getByText("workflow-1")).toBeTruthy();
      expect(within(row).getByText("Borrador")).toBeTruthy();
      expect(within(row).getByText("Sin publicar")).toBeTruthy();
      expect(within(row).getByText(formatLongDateEs("2026-09-21T16:00:00.000Z"))).toBeTruthy();

      expect(client.get).toHaveBeenCalledWith("/applications/app-1/workflows", expect.anything());
      expect(screen.queryByTestId("create-workflow-trigger")).toBeNull();
    });

    it("shows the latest published version of each workflow under Última versión", async () => {
      client.get.mockImplementation(async () => ({
        data: {
          workflows: [
            { ...listedWorkflow, latestVersion: "1.2.0" },
            { ...listedWorkflow, id: "workflow-2", latestVersion: null },
          ],
        },
      }));

      renderWorkflowList();

      const published = await screen.findByTestId("workflow-row-workflow-1");
      expect(within(published).getByText("1.2.0")).toBeTruthy();
      expect(within(published).queryByText("Sin publicar")).toBeNull();
      expect(
        within(screen.getByTestId("workflow-row-workflow-2")).getByText("Sin publicar"),
      ).toBeTruthy();
    });

    it("lists every workflow of the application", async () => {
      client.get.mockImplementation(async () => ({
        data: {
          workflows: [
            listedWorkflow,
            { ...listedWorkflow, id: "workflow-2", name: "Detección de roya" },
          ],
        },
      }));

      renderWorkflowList();

      expect(await screen.findByTestId("workflow-row-workflow-1")).toBeTruthy();
      expect(screen.getByTestId("workflow-row-workflow-2")).toBeTruthy();
      expect(screen.getByText("Detección de roya")).toBeTruthy();
    });

    it("shows the create button next to the listing for administrators of an active application", async () => {
      client.get.mockImplementation(async () => ({ data: { workflows: [listedWorkflow] } }));

      renderWorkflowList({ canManage: true });

      await screen.findByTestId("workflows-table");
      expect(screen.getByTestId("create-workflow-trigger").textContent).toBe("Crear workflow");
    });

    it("shows the empty state when the application has no workflows", async () => {
      client.get.mockImplementation(async () => ({ data: { workflows: [] } }));

      renderWorkflowList({ canManage: true });

      const empty = await screen.findByTestId("workflows-empty");
      expect(empty.textContent).toBe("Aún no hay workflows en esta aplicación.");
      expect(screen.queryByTestId("workflows-table")).toBeNull();
    });

    it("shows the loading state while workflows are being fetched", async () => {
      let resolveWorkflows: (value: unknown) => void = () => {};
      client.get.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveWorkflows = resolve;
          }),
      );

      renderWorkflowList();

      const loading = await screen.findByTestId("workflows-loading");
      expect(loading.textContent).toBe("Cargando workflows…");

      resolveWorkflows({ data: { workflows: [listedWorkflow] } });
      expect(await screen.findByTestId("workflow-row-workflow-1")).toBeTruthy();
      expect(screen.queryByTestId("workflows-loading")).toBeNull();
    });

    it("shows a retryable error state when loading fails", async () => {
      let workflowsCalls = 0;
      client.get.mockImplementation(() => {
        workflowsCalls += 1;
        if (workflowsCalls === 1) {
          throw { isAxiosError: true, response: { status: 500, data: {} } };
        }
        return { data: { workflows: [listedWorkflow] } };
      });

      renderWorkflowList();

      expect(
        await screen.findByText("No pudimos cargar los workflows. Inténtalo nuevamente."),
      ).toBeTruthy();
      expect(screen.queryByTestId("workflows-table")).toBeNull();

      fireEvent.click(screen.getByTestId("workflows-retry"));

      expect(await screen.findByTestId("workflow-row-workflow-1")).toBeTruthy();
      expect(workflowsCalls).toBe(2);
    });

    it("surfaces the server message without listing anything when the application is not accessible", async () => {
      client.get.mockImplementation(() => {
        throw {
          isAxiosError: true,
          response: { status: 404, data: { message: "No encontramos esta aplicación." } },
        };
      });

      renderWorkflowList();

      expect(await screen.findByText("No encontramos esta aplicación.")).toBeTruthy();
      expect(screen.queryByTestId("workflows-table")).toBeNull();
      expect(screen.queryByTestId("workflows-empty")).toBeNull();
    });

    it("paints the loading state on the first commit instead of the empty state", () => {
      client.get.mockImplementation(() => new Promise(() => {}));
      const frames: string[] = [];

      render(workflowPanel(activeApp, false, frames));

      expect(frames[0]).toContain("Cargando workflows…");
      expect(frames[0]).not.toContain("Aún no hay workflows en esta aplicación.");
    });

    it("never paints the workflows of the previous application when switching applications", async () => {
      const otherApp: Application = { ...activeApp, id: "app-3", name: "Invernadero" };
      client.get.mockImplementation(async (url: string) =>
        url === "/applications/app-1/workflows"
          ? { data: { workflows: [listedWorkflow] } }
          : new Promise(() => {}),
      );
      const frames: string[] = [];

      const view = render(workflowPanel(activeApp, false, frames));
      expect(await screen.findByTestId("workflow-row-workflow-1")).toBeTruthy();
      const framesBeforeSwitch = frames.length;

      view.rerender(workflowPanel(otherApp, false, frames));

      const switchFrame = frames[framesBeforeSwitch];
      expect(switchFrame).toBeDefined();
      expect(switchFrame).not.toContain("workflow-row-workflow-1");
      expect(switchFrame).not.toContain("Diagnóstico de hoja de café");
      expect(switchFrame).toContain("Cargando workflows…");
      expect(client.get).toHaveBeenLastCalledWith(
        "/applications/app-3/workflows",
        expect.anything(),
      );
    });

    it("lists the workflows of an archived application without offering to create one", async () => {
      client.get.mockImplementation(async () => ({ data: { workflows: [listedWorkflow] } }));

      renderWorkflowList({ application: archivedApp, canManage: true });

      expect(await screen.findByTestId("workflow-row-workflow-1")).toBeTruthy();
      expect(screen.queryByTestId("create-workflow-trigger")).toBeNull();
    });

    it("reloads the list after an administrator creates a workflow", async () => {
      let workflowsCalls = 0;
      client.get.mockImplementation(async () => {
        workflowsCalls += 1;
        return { data: { workflows: workflowsCalls === 1 ? [] : [listedWorkflow] } };
      });
      client.post.mockResolvedValueOnce({ data: { workflow: listedWorkflow } });

      renderWorkflowList({ canManage: true });

      expect(await screen.findByTestId("workflows-empty")).toBeTruthy();

      fireEvent.click(screen.getByTestId("create-workflow-trigger"));
      fireEvent.change(screen.getByLabelText("Nombre del workflow"), {
        target: { value: "Diagnóstico de hoja de café" },
      });
      fireEvent.click(screen.getByTestId("create-workflow-submit"));

      expect(await screen.findByTestId("workflow-row-workflow-1")).toBeTruthy();
      expect(workflowsCalls).toBe(2);
      expect(screen.queryByTestId("workflows-empty")).toBeNull();
    });
  });

  describe("US-026: Ver el detalle de un workflow", () => {
    const workflowDetail = {
      workflow: {
        id: "workflow-1",
        applicationId: "app-1",
        name: "Diagnóstico de hoja de café",
        status: "draft",
        createdAt: "2026-09-21T15:00:00.000Z",
        updatedAt: "2026-09-21T16:00:00.000Z",
      },
      draft: { nodes: [] },
      versions: [],
    };

    function workflowDetailPanel({
      application = activeApp,
      workflowId = "workflow-1",
      canManage = false,
      onBackToWorkflows = vi.fn(),
    }: {
      application?: Application;
      workflowId?: string;
      canManage?: boolean;
      onBackToWorkflows?: () => void;
    } = {}) {
      return (
        <TooltipProvider>
          <ApplicationDetailPanel
            application={application}
            workspaceName="Laboratorio Andino"
            canManage={canManage}
            activeSection="workflows"
            workflowId={workflowId}
            onBackToWorkflows={onBackToWorkflows}
            onBack={vi.fn()}
            onApplicationUpdated={vi.fn()}
            onApplicationArchived={vi.fn()}
          />
        </TooltipProvider>
      );
    }

    it("shows 'Cargando workflow…' while the detail is being fetched", async () => {
      let resolveDetail: (value: unknown) => void = () => {};
      client.get.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveDetail = resolve;
          }),
      );

      render(workflowDetailPanel());

      const loading = await screen.findByTestId("workflow-detail-loading");
      expect(loading.textContent).toBe("Cargando workflow…");

      resolveDetail({ data: workflowDetail });
      expect(
        await screen.findByRole("heading", { name: "Diagnóstico de hoja de café" }),
      ).toBeTruthy();
      expect(screen.queryByTestId("workflow-detail-loading")).toBeNull();
    });

    it("shows the name, ID and status of a workflow of the application", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));

      render(workflowDetailPanel());

      const header = await screen.findByTestId("workflow-detail-header");
      expect(
        within(header).getByRole("heading", { name: "Diagnóstico de hoja de café" }),
      ).toBeTruthy();
      expect(within(header).getByText("workflow-1")).toBeTruthy();
      expect(within(header).getByText("Borrador")).toBeTruthy();
      expect(client.get).toHaveBeenCalledWith(
        "/applications/app-1/workflows/workflow-1",
        expect.anything(),
      );
    });

    it("explains that a classification model must be added before configuring a condition", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));

      render(workflowDetailPanel({ canManage: true }));

      expect(
        await screen.findByText(
          "Agrega primero al lienzo una versión contratada de un modelo de clasificación.",
        ),
      ).toBeTruthy();
      expect((screen.getByLabelText("Resultado de origen") as HTMLSelectElement).disabled).toBe(
        true,
      );
    });

    it("keeps contracted versions when another model's versions fail to load", async () => {
      client.get.mockImplementation(async (url: string) => {
        if (url === "/applications/app-1/workflows/workflow-1") return { data: workflowDetail };
        if (url === "/applications/app-1/models")
          return {
            data: {
              models: [
                { id: "model-good", name: "Clasificador" },
                { id: "model-unavailable", name: "Sin respuesta" },
              ],
            },
          };
        if (url.endsWith("/model-good/versions"))
          return {
            data: {
              versions: [
                {
                  id: "mv-good",
                  version: "1.0.0",
                  contract: {
                    input: {
                      type: "image",
                      width: 224,
                      height: 224,
                      channels: 3,
                      normalization: "zero_to_one",
                    },
                    output: { type: "classification", labels: ["hoja"] },
                  },
                },
              ],
            },
          };
        throw new Error("Model versions unavailable");
      });

      render(workflowDetailPanel({ canManage: true }));

      expect(await screen.findByRole("option", { name: "Clasificador · 1.0.0" })).toBeTruthy();
    });

    it("shows the route Workflows / <nombre> and returns to the list from Workflows", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));
      const onBackToWorkflows = vi.fn();

      render(workflowDetailPanel({ onBackToWorkflows }));

      const route = await screen.findByRole("navigation", { name: "breadcrumb" });
      expect(within(route).getByText("Diagnóstico de hoja de café")).toBeTruthy();
      fireEvent.click(within(route).getByRole("link", { name: "Workflows" }));
      expect(onBackToWorkflows).toHaveBeenCalledTimes(1);
    });

    it("leaves the Workflows link to the browser when no navigation handler is given", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));

      render(
        <TooltipProvider>
          <ApplicationDetailPanel
            application={activeApp}
            activeSection="workflows"
            workflowId="workflow-1"
            onApplicationUpdated={vi.fn()}
            onApplicationArchived={vi.fn()}
          />
        </TooltipProvider>,
      );

      const route = await screen.findByRole("navigation", { name: "breadcrumb" });
      const link = within(route).getByRole("link", { name: "Workflows" });
      expect(link.getAttribute("href")).toBe("/dashboard/applications/app-1/workflows");

      // The document listener runs after React's handler, so it sees whether the
      // component cancelled the browser navigation, and then cancels it itself.
      let defaultPrevented: boolean | undefined;
      const observeClick = (event: MouseEvent) => {
        defaultPrevented = event.defaultPrevented;
        event.preventDefault();
      };
      document.addEventListener("click", observeClick);
      fireEvent.click(link);
      document.removeEventListener("click", observeClick);

      expect(defaultPrevented).toBe(false);
    });

    it("encodes the workflow id in the request path", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));

      render(workflowDetailPanel({ workflowId: "../private" }));

      await screen.findByTestId("workflow-detail-header");
      expect(client.get).toHaveBeenCalledWith(
        "/applications/app-1/workflows/..%2Fprivate",
        expect.anything(),
      );
    });

    it("distinguishes the draft from the published versions with two tabs", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));
      const user = userEvent.setup();

      render(workflowDetailPanel());

      const draftTab = await screen.findByRole("tab", { name: "Borrador" });
      const versionsTab = screen.getByRole("tab", { name: "Versiones publicadas" });
      expect(draftTab.getAttribute("aria-selected")).toBe("true");
      expect(screen.getByText("Este borrador aún no tiene nodos.")).toBeTruthy();
      expect(screen.queryByText("Aún no hay versiones publicadas.")).toBeNull();

      await user.click(versionsTab);

      expect(versionsTab.getAttribute("aria-selected")).toBe("true");
      expect(screen.getByText("Aún no hay versiones publicadas.")).toBeTruthy();
      expect(screen.queryByText("Este borrador aún no tiene nodos.")).toBeNull();
    });

    it("keeps image input disabled after a conflict reloads the persisted node", async () => {
      let detailCalls = 0;
      client.get.mockImplementation(async () => {
        detailCalls += 1;
        return {
          data:
            detailCalls === 1
              ? workflowDetail
              : {
                  ...workflowDetail,
                  draft: {
                    nodes: [{ id: "node-1", type: "input.image", outputs: { imagen: "image" } }],
                  },
                },
        };
      });
      client.post.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 409,
          data: { message: "Este workflow ya tiene una entrada de imagen." },
        },
      });

      render(workflowDetailPanel({ canManage: true }));

      const button = (await screen.findByRole("button", {
        name: "Entrada de imagen",
      })) as HTMLButtonElement;
      fireEvent.click(button);
      expect(button.disabled).toBe(true);
      fireEvent.drop(screen.getByRole("region", { name: "Lienzo del workflow" }), {
        dataTransfer: { getData: () => "input.image" },
      });
      expect(client.post).toHaveBeenCalledTimes(1);

      expect(await screen.findByText("Imagen de entrada")).toBeTruthy();
      expect(
        (screen.getByRole("button", { name: "Entrada de imagen" }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(client.post).toHaveBeenCalledTimes(1);
    });

    it("allows retry after a non-conflict request failure", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));
      client.post
        .mockRejectedValueOnce({ isAxiosError: true, response: { status: 500, data: {} } })
        .mockResolvedValueOnce({
          data: {
            draft: {
              nodes: [{ id: "node-1", type: "input.image", outputs: { imagen: "image" } }],
            },
          },
        });

      render(workflowDetailPanel({ canManage: true }));
      const button = (await screen.findByRole("button", {
        name: "Entrada de imagen",
      })) as HTMLButtonElement;
      fireEvent.click(button);
      expect(button.disabled).toBe(true);
      await waitFor(() =>
        expect(
          (screen.getByRole("button", { name: "Entrada de imagen" }) as HTMLButtonElement).disabled,
        ).toBe(false),
      );
      fireEvent.click(screen.getByRole("button", { name: "Entrada de imagen" }));
      expect(await screen.findByText("Imagen de entrada")).toBeTruthy();
      expect(client.post).toHaveBeenCalledTimes(2);
    });

    it.each([
      ["the workflow does not exist", "No encontramos este workflow."],
      ["the requester cannot access the application", "No encontramos esta aplicación."],
    ])("shows 'No encontramos este workflow.' when %s", async (_case, serverMessage) => {
      client.get.mockImplementation(() => {
        throw {
          isAxiosError: true,
          response: { status: 404, data: { message: serverMessage } },
        };
      });

      render(workflowDetailPanel());

      const notFound = await screen.findByTestId("workflow-detail-not-found");
      expect(notFound.textContent).toBe("No encontramos este workflow.");
      expect(screen.queryByTestId("workflow-detail-header")).toBeNull();
      expect(screen.queryByRole("tab")).toBeNull();
      expect(screen.queryByTestId("workflow-detail-loading")).toBeNull();
    });

    it("shows a retryable error state when the detail fails to load", async () => {
      let detailCalls = 0;
      client.get.mockImplementation(() => {
        detailCalls += 1;
        if (detailCalls === 1) {
          throw { isAxiosError: true, response: { status: 500, data: {} } };
        }
        return { data: workflowDetail };
      });

      render(workflowDetailPanel());

      expect(
        await screen.findByText("No pudimos cargar el workflow. Inténtalo nuevamente."),
      ).toBeTruthy();
      expect(screen.queryByTestId("workflow-detail-not-found")).toBeNull();

      fireEvent.click(screen.getByTestId("workflow-detail-retry"));

      expect(await screen.findByTestId("workflow-detail-header")).toBeTruthy();
      expect(detailCalls).toBe(2);
    });

    it("never paints the previous workflow while another one is loading", async () => {
      client.get.mockImplementation(async (url: string) =>
        url.endsWith("/workflow-2") ? new Promise(() => {}) : { data: workflowDetail },
      );

      const { rerender } = render(workflowDetailPanel());
      expect(await screen.findByTestId("workflow-detail-header")).toBeTruthy();

      rerender(workflowDetailPanel({ workflowId: "workflow-2" }));

      expect(await screen.findByTestId("workflow-detail-loading")).toBeTruthy();
      expect(screen.queryByText("Diagnóstico de hoja de café")).toBeNull();
    });

    it("opens the detail of a workflow from the list", async () => {
      client.get.mockImplementation(async () => ({
        data: { workflows: [workflowDetail.workflow] },
      }));
      const onOpenWorkflow = vi.fn();

      render(
        <TooltipProvider>
          <ApplicationDetailPanel
            application={activeApp}
            workspaceName="Laboratorio Andino"
            canManage={false}
            activeSection="workflows"
            onOpenWorkflow={onOpenWorkflow}
            onBack={vi.fn()}
            onApplicationUpdated={vi.fn()}
            onApplicationArchived={vi.fn()}
          />
        </TooltipProvider>,
      );

      fireEvent.click(await screen.findByRole("button", { name: "Diagnóstico de hoja de café" }));

      expect(onOpenWorkflow).toHaveBeenCalledWith("workflow-1");
    });
  });

  describe("US-027: Editar el nombre de un workflow", () => {
    const workflowDetail = {
      workflow: {
        id: "workflow-1",
        applicationId: "app-1",
        name: "Diagnóstico de hoja de café",
        status: "draft",
        createdAt: "2026-09-21T15:00:00.000Z",
        updatedAt: "2026-09-21T16:00:00.000Z",
      },
      draft: { nodes: [] },
      versions: [],
    };

    function workflowDetailPanel({
      application = activeApp,
      workflowId = "workflow-1",
      canManage = true,
    }: {
      application?: Application;
      workflowId?: string;
      canManage?: boolean;
    } = {}) {
      return (
        <TooltipProvider>
          <ApplicationDetailPanel
            application={application}
            workspaceName="Laboratorio Andino"
            canManage={canManage}
            activeSection="workflows"
            workflowId={workflowId}
            onBack={vi.fn()}
            onApplicationUpdated={vi.fn()}
            onApplicationArchived={vi.fn()}
          />
        </TooltipProvider>
      );
    }

    async function openRenameDialog() {
      fireEvent.click(await screen.findByTestId("workflow-detail-actions"));
      fireEvent.click(await screen.findByTestId("workflow-detail-rename-trigger"));
      return screen.findByRole("dialog", { name: "Editar nombre del workflow" });
    }

    it("shows the Acciones trigger only for an administrator of an active application", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));

      render(workflowDetailPanel({ canManage: true }));
      await screen.findByTestId("workflow-detail-header");
      expect(screen.getByTestId("workflow-detail-actions")).toBeTruthy();
      cleanup();

      render(workflowDetailPanel({ canManage: false }));
      await screen.findByTestId("workflow-detail-header");
      expect(screen.queryByTestId("workflow-detail-actions")).toBeNull();
      cleanup();

      render(workflowDetailPanel({ application: archivedApp, canManage: true }));
      await screen.findByTestId("workflow-detail-header");
      expect(screen.queryByTestId("workflow-detail-actions")).toBeNull();
    });

    it("opens a dialog prefilled with the current name from Acciones > Editar nombre", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));

      render(workflowDetailPanel());
      await screen.findByTestId("workflow-detail-header");

      const dialog = await openRenameDialog();
      const input = within(dialog).getByLabelText("Nombre del workflow") as HTMLInputElement;
      expect(input.value).toBe("Diagnóstico de hoja de café");
    });

    it("saves a valid name, closes the dialog, shows a success toast and updates the header without reloading", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));
      client.patch.mockResolvedValueOnce({
        data: { workflow: { ...workflowDetail.workflow, name: "Diagnóstico de café" } },
      });

      render(workflowDetailPanel());
      await screen.findByTestId("workflow-detail-header");
      const getCallsBeforeSave = client.get.mock.calls.length;

      const dialog = await openRenameDialog();
      fireEvent.change(within(dialog).getByLabelText("Nombre del workflow"), {
        target: { value: "Diagnóstico de café" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));

      await waitFor(() => {
        expect(client.patch).toHaveBeenCalledWith("/applications/app-1/workflows/workflow-1", {
          name: "Diagnóstico de café",
        });
        expect(toastMock.success).toHaveBeenCalledWith("Nombre del workflow actualizado.");
      });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      expect(
        within(screen.getByTestId("workflow-detail-header")).getByRole("heading", {
          name: "Diagnóstico de café",
        }),
      ).toBeTruthy();
      expect(client.get.mock.calls.length).toBe(getCallsBeforeSave);
    });

    it("trims the name before sending it to the server", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));
      client.patch.mockResolvedValueOnce({
        data: { workflow: { ...workflowDetail.workflow, name: "Diagnóstico" } },
      });

      render(workflowDetailPanel());
      await screen.findByTestId("workflow-detail-header");

      const dialog = await openRenameDialog();
      fireEvent.change(within(dialog).getByLabelText("Nombre del workflow"), {
        target: { value: "  Diagnóstico  " },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));

      await waitFor(() => {
        expect(client.patch).toHaveBeenCalledWith("/applications/app-1/workflows/workflow-1", {
          name: "Diagnóstico",
        });
      });
    });

    it("rejects an empty or whitespace-only name without calling the server and keeps the displayed name", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));

      render(workflowDetailPanel());
      await screen.findByTestId("workflow-detail-header");

      const dialog = await openRenameDialog();
      fireEvent.change(within(dialog).getByLabelText("Nombre del workflow"), {
        target: { value: "   " },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));

      expect(await within(dialog).findByText("Ingresa un nombre para el workflow.")).toBeTruthy();
      expect(client.patch).not.toHaveBeenCalled();
      expect(
        within(screen.getByTestId("workflow-detail-header")).getByRole("heading", {
          name: "Diagnóstico de hoja de café",
        }),
      ).toBeTruthy();
    });

    it("shows 'Guardando cambios…' while the rename request is in flight", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));
      let resolvePatch: (value: unknown) => void = () => {};
      client.patch.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePatch = resolve;
        }),
      );

      render(workflowDetailPanel());
      await screen.findByTestId("workflow-detail-header");

      const dialog = await openRenameDialog();
      fireEvent.change(within(dialog).getByLabelText("Nombre del workflow"), {
        target: { value: "Diagnóstico de café" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));

      expect(
        (await within(dialog).findByRole("button", { name: "Guardando cambios…" })).hasAttribute(
          "disabled",
        ),
      ).toBe(true);

      resolvePatch({
        data: { workflow: { ...workflowDetail.workflow, name: "Diagnóstico de café" } },
      });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    });

    it("closes the dialog via Cancelar without calling the server", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));

      render(workflowDetailPanel());
      await screen.findByTestId("workflow-detail-header");

      const dialog = await openRenameDialog();
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      expect(client.patch).not.toHaveBeenCalled();
    });

    it("shows an error toast and keeps the displayed name when the server rejects the rename", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));
      client.patch.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 403,
          data: { message: "No tienes permiso para editar este workflow." },
        },
      });

      render(workflowDetailPanel());
      await screen.findByTestId("workflow-detail-header");

      const dialog = await openRenameDialog();
      fireEvent.change(within(dialog).getByLabelText("Nombre del workflow"), {
        target: { value: "Diagnóstico de café" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith(
          "No tienes permiso para editar este workflow.",
        );
      });
      expect(
        within(screen.getByTestId("workflow-detail-header")).getByRole("heading", {
          name: "Diagnóstico de hoja de café",
        }),
      ).toBeTruthy();
    });

    it("encodes the workflow id with encodeURIComponent when building the PATCH url", async () => {
      client.get.mockImplementation(async () => ({
        data: { ...workflowDetail, workflow: { ...workflowDetail.workflow, id: "../private" } },
      }));
      client.patch.mockResolvedValueOnce({
        data: {
          workflow: { ...workflowDetail.workflow, id: "../private", name: "Diagnóstico de café" },
        },
      });

      render(workflowDetailPanel({ workflowId: "../private" }));
      await screen.findByTestId("workflow-detail-header");

      const dialog = await openRenameDialog();
      fireEvent.change(within(dialog).getByLabelText("Nombre del workflow"), {
        target: { value: "Diagnóstico de café" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));

      await waitFor(() => {
        expect(client.patch).toHaveBeenCalledWith("/applications/app-1/workflows/..%2Fprivate", {
          name: "Diagnóstico de café",
        });
      });
    });
  });

  describe("US-034: Eliminar un nodo del borrador", () => {
    const imageNode = {
      id: "image-node",
      type: "input.image" as const,
      outputs: { imagen: "image" as const },
    };
    const workflowDetail = {
      workflow: {
        id: "workflow-1",
        applicationId: "app-1",
        name: "Diagnóstico de hoja de café",
        status: "draft",
        createdAt: "2026-09-21T15:00:00.000Z",
        updatedAt: "2026-09-21T16:00:00.000Z",
      },
      draft: { nodes: [imageNode] },
      versions: [],
    };

    function workflowDetailPanel() {
      return (
        <TooltipProvider>
          <ApplicationDetailPanel
            application={activeApp}
            workspaceName="Laboratorio Andino"
            canManage
            activeSection="workflows"
            workflowId="workflow-1"
            onBack={vi.fn()}
            onApplicationUpdated={vi.fn()}
            onApplicationArchived={vi.fn()}
          />
        </TooltipProvider>
      );
    }

    it("lets an administrator cancel or confirm node deletion and updates the draft", async () => {
      client.get.mockImplementation(async (url: string) =>
        url.endsWith("/workflows/workflow-1") ? { data: workflowDetail } : { data: { models: [] } },
      );
      client.delete.mockResolvedValueOnce({ data: { draft: { nodes: [] } } });

      render(workflowDetailPanel());
      await screen.findByTestId("workflow-node-image-node");

      fireEvent.click(screen.getByRole("button", { name: "Imagen de entrada" }));
      fireEvent.click(screen.getByRole("button", { name: "Eliminar nodo" }));

      const dialog = await screen.findByRole("dialog", { name: '¿Eliminar "Imagen de entrada"?' });
      expect(within(dialog).getByText("También se eliminarán sus conexiones.")).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
      expect(client.delete).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

      fireEvent.click(screen.getByRole("button", { name: "Imagen de entrada" }));
      fireEvent.click(screen.getByRole("button", { name: "Eliminar nodo" }));
      const confirmation = await screen.findByRole("dialog", {
        name: '¿Eliminar "Imagen de entrada"?',
      });
      fireEvent.click(within(confirmation).getByRole("button", { name: "Eliminar nodo" }));

      await waitFor(() => {
        expect(client.delete).toHaveBeenCalledWith(
          "/applications/app-1/workflows/workflow-1/nodes/image-node",
        );
        expect(toastMock.success).toHaveBeenCalledWith("Nodo eliminado.");
      });
      await waitFor(() => expect(screen.queryByTestId("workflow-node-image-node")).toBeNull());
    });

    it("shows the forbidden server message when node deletion is rejected", async () => {
      client.get.mockImplementation(async (url: string) =>
        url.endsWith("/workflows/workflow-1") ? { data: workflowDetail } : { data: { models: [] } },
      );
      client.delete.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 403,
          data: { message: "No tienes permiso para editar este workflow." },
        },
      });

      render(workflowDetailPanel());
      await screen.findByTestId("workflow-node-image-node");
      fireEvent.click(screen.getByRole("button", { name: "Imagen de entrada" }));
      fireEvent.click(screen.getByRole("button", { name: "Eliminar nodo" }));
      const dialog = await screen.findByRole("dialog", { name: '¿Eliminar "Imagen de entrada"?' });
      fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar nodo" }));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith(
          "No tienes permiso para editar este workflow.",
        );
      });
      await screen.findByTestId("workflow-node-image-node");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(
        within(screen.getByTestId("workflow-node-image-node"))
          .getByRole("button", { name: "Imagen de entrada" })
          .getAttribute("aria-pressed"),
      ).toBe("false");
    });

    it("keeps a surviving connection selected after reloading the returned draft", async () => {
      const otherNode = {
        id: "other-node",
        type: "input.image" as const,
        outputs: { imagen: "image" as const },
      };
      const connection = {
        sourceNodeId: "other-node",
        sourcePort: "imagen",
        targetNodeId: "image-node",
        targetPort: "imagen",
      };
      client.get.mockImplementation(async (url: string) =>
        url.endsWith("/workflows/workflow-1")
          ? {
              data: {
                ...workflowDetail,
                draft: { nodes: [imageNode, otherNode], connections: [connection] },
              },
            }
          : { data: { models: [] } },
      );
      client.delete.mockResolvedValueOnce({
        data: { draft: { nodes: [otherNode], connections: [{ ...connection }] } },
      });

      render(workflowDetailPanel());
      await screen.findByTestId("workflow-node-image-node");
      fireEvent.click(screen.getByRole("button", { name: "imagen → imagen" }));
      fireEvent.click(
        within(screen.getByTestId("workflow-node-image-node")).getByRole("button", {
          name: "Imagen de entrada",
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Eliminar nodo" }));
      const dialog = await screen.findByRole("dialog", { name: '¿Eliminar "Imagen de entrada"?' });
      fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar nodo" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "imagen → imagen" }).getAttribute("aria-pressed"),
        ).toBe("true");
      });
      expect(screen.getByRole("button", { name: "Eliminar conexión" })).toBeTruthy();
    });
  });
  describe("US-037: Archivar un workflow", () => {
    const workflowDetail = {
      workflow: {
        id: "workflow-1",
        applicationId: "app-1",
        name: "Diagnóstico de hoja de café",
        status: "draft",
        createdAt: "2026-09-21T15:00:00.000Z",
        updatedAt: "2026-09-21T16:00:00.000Z",
      },
      draft: { nodes: [] },
      versions: [
        {
          id: "version-1",
          workflowId: "workflow-1",
          version: "1.0.0",
          createdAt: "2026-09-23T10:00:00.000Z",
        },
      ],
    };
    const archivedWorkflow = { ...workflowDetail.workflow, status: "archived" };

    function renderWorkflowDetail(workflowId = "workflow-1") {
      return render(
        <TooltipProvider>
          <ApplicationDetailPanel
            application={activeApp}
            workspaceName="Laboratorio Andino"
            canManage
            activeSection="workflows"
            workflowId={workflowId}
            onBack={vi.fn()}
            onApplicationUpdated={vi.fn()}
            onApplicationArchived={vi.fn()}
          />
        </TooltipProvider>,
      );
    }

    async function openArchiveDialog() {
      fireEvent.click(await screen.findByTestId("workflow-detail-actions"));
      fireEvent.click(await screen.findByTestId("workflow-detail-archive-trigger"));
      return screen.findByRole("dialog");
    }

    it("warns from Acciones > Archivar workflow that the SDK stops receiving new versions", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));

      renderWorkflowDetail();
      const dialog = await openArchiveDialog();

      expect(
        within(dialog).getByText(
          "El SDK dejará de recibir versiones nuevas de este workflow. El historial se conservará.",
        ),
      ).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Archivar workflow" })).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeTruthy();
    });

    it("archives on confirmation, shows Workflow archivado. and the Archivado label, and keeps the versions", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));
      let resolvePost: (value: unknown) => void = () => {};
      client.post.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePost = resolve;
        }),
      );

      renderWorkflowDetail();
      const dialog = await openArchiveDialog();
      fireEvent.click(within(dialog).getByRole("button", { name: "Archivar workflow" }));

      expect(
        (await within(dialog).findByRole("button", { name: "Archivando workflow…" })).hasAttribute(
          "disabled",
        ),
      ).toBe(true);
      expect(client.post).toHaveBeenCalledWith("/applications/app-1/workflows/workflow-1/archive");

      resolvePost({ data: { workflow: archivedWorkflow } });
      await waitFor(() => {
        expect(toastMock.success).toHaveBeenCalledWith("Workflow archivado.");
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      const header = screen.getByTestId("workflow-detail-header");
      expect(within(header).getByText("Archivado")).toBeTruthy();

      await userEvent.setup().click(screen.getByRole("tab", { name: "Versiones publicadas" }));
      expect(
        within(screen.getByRole("table", { name: "Versiones publicadas" })).getByText("1.0.0"),
      ).toBeTruthy();

      fireEvent.click(screen.getByTestId("workflow-detail-actions"));
      await screen.findByTestId("workflow-detail-rename-trigger");
      expect(screen.queryByTestId("workflow-detail-archive-trigger")).toBeNull();
    });

    it("does not offer Archivar workflow for an already archived workflow", async () => {
      client.get.mockImplementation(async () => ({
        data: { ...workflowDetail, workflow: archivedWorkflow },
      }));

      renderWorkflowDetail();
      const header = await screen.findByTestId("workflow-detail-header");
      expect(within(header).getByText("Archivado")).toBeTruthy();

      fireEvent.click(screen.getByTestId("workflow-detail-actions"));
      await screen.findByTestId("workflow-detail-rename-trigger");
      expect(screen.queryByTestId("workflow-detail-archive-trigger")).toBeNull();
    });

    it("closes via Cancelar without archiving", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));

      renderWorkflowDetail();
      const dialog = await openArchiveDialog();
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      expect(client.post).not.toHaveBeenCalled();
    });

    it("shows the permission error and keeps the workflow status when the server rejects it", async () => {
      client.get.mockImplementation(async () => ({ data: workflowDetail }));
      client.post.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 403,
          data: { message: "No tienes permiso para archivar este workflow." },
        },
      });

      renderWorkflowDetail();
      const dialog = await openArchiveDialog();
      fireEvent.click(within(dialog).getByRole("button", { name: "Archivar workflow" }));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith(
          "No tienes permiso para archivar este workflow.",
        );
      });
      const header = screen.getByTestId("workflow-detail-header");
      expect(within(header).getByText("Borrador")).toBeTruthy();
      expect(within(header).queryByText("Archivado")).toBeNull();
    });

    it("encodes the workflow id when building the archive url", async () => {
      client.get.mockImplementation(async () => ({
        data: { ...workflowDetail, workflow: { ...workflowDetail.workflow, id: "../private" } },
      }));
      client.post.mockResolvedValueOnce({
        data: { workflow: { ...archivedWorkflow, id: "../private" } },
      });

      renderWorkflowDetail("../private");
      const dialog = await openArchiveDialog();
      fireEvent.click(within(dialog).getByRole("button", { name: "Archivar workflow" }));

      await waitFor(() => {
        expect(client.post).toHaveBeenCalledWith(
          "/applications/app-1/workflows/..%2Fprivate/archive",
        );
      });
    });
  });

  describe("US-035: Validar un borrador de workflow", () => {
    const workflowDetail = {
      workflow: {
        id: "workflow-1",
        applicationId: "app-1",
        name: "Diagnóstico de hoja de café",
        status: "draft",
        createdAt: "2026-09-21T15:00:00.000Z",
        updatedAt: "2026-09-21T16:00:00.000Z",
      },
      draft: { nodes: [] },
      versions: [],
    };
    const validationUrl = "/applications/app-1/workflows/workflow-1/validation";

    function workflowDetailPanel({
      application = activeApp,
      canManage = true,
    }: {
      application?: Application;
      canManage?: boolean;
    } = {}) {
      return (
        <TooltipProvider>
          <ApplicationDetailPanel
            application={application}
            workspaceName="Laboratorio Andino"
            canManage={canManage}
            activeSection="workflows"
            workflowId="workflow-1"
            onBack={vi.fn()}
            onApplicationUpdated={vi.fn()}
            onApplicationArchived={vi.fn()}
          />
        </TooltipProvider>
      );
    }

    function mockValidation(response: () => Promise<unknown>) {
      client.get.mockImplementation(async (url: string) => {
        if (url === validationUrl) return response();
        if (url === "/applications/app-1/models") return { data: { models: [] } };
        return { data: workflowDetail };
      });
    }

    it("offers Validar workflow only to administrators of an active application", async () => {
      mockValidation(async () => ({ data: { publishable: true, errors: [] } }));

      render(workflowDetailPanel());
      await screen.findByTestId("workflow-detail-header");
      expect(screen.getByRole("button", { name: "Validar workflow" })).toBeTruthy();
      cleanup();

      render(workflowDetailPanel({ canManage: false }));
      await screen.findByTestId("workflow-detail-header");
      expect(screen.queryByRole("button", { name: "Validar workflow" })).toBeNull();
      cleanup();

      render(workflowDetailPanel({ application: archivedApp }));
      await screen.findByTestId("workflow-detail-header");
      expect(screen.queryByRole("button", { name: "Validar workflow" })).toBeNull();
    });

    it("shows Validando workflow… and then confirms that the draft is publishable", async () => {
      let resolveValidation: (value: unknown) => void = () => {};
      mockValidation(
        () =>
          new Promise((resolve) => {
            resolveValidation = resolve;
          }),
      );

      render(workflowDetailPanel());
      await screen.findByTestId("workflow-detail-header");
      fireEvent.click(screen.getByRole("button", { name: "Validar workflow" }));

      const pending = await screen.findByRole("button", { name: "Validando workflow…" });
      expect((pending as HTMLButtonElement).disabled).toBe(true);

      resolveValidation({ data: { publishable: true, errors: [] } });

      expect(await screen.findByText("El workflow está listo para publicarse.")).toBeTruthy();
      expect(screen.queryByRole("region", { name: "Errores de validación" })).toBeNull();
      expect(client.post).not.toHaveBeenCalled();
      expect(client.patch).not.toHaveBeenCalled();
    });

    it("opens Errores de validación with the node, port and description of each error", async () => {
      mockValidation(async () => ({
        data: {
          publishable: false,
          errors: [
            {
              code: "requiredInput",
              nodeId: "classifier",
              nodeName: "Clasificador",
              port: "image",
              message: 'El nodo "Clasificador" necesita una imagen de entrada.',
            },
            {
              code: "missingOutput",
              nodeId: null,
              nodeName: null,
              port: null,
              message: "El workflow necesita al menos un nodo de salida.",
            },
          ],
        },
      }));

      render(workflowDetailPanel());
      await screen.findByTestId("workflow-detail-header");
      fireEvent.click(screen.getByRole("button", { name: "Validar workflow" }));

      const panel = await screen.findByRole("region", { name: "Errores de validación" });
      expect(within(panel).getByRole("columnheader", { name: "Nodo" })).toBeTruthy();
      expect(within(panel).getByRole("columnheader", { name: "Puerto" })).toBeTruthy();
      expect(within(panel).getByRole("columnheader", { name: "Descripción" })).toBeTruthy();
      const [, first, second] = within(panel).getAllByRole("row");
      expect(
        within(first as HTMLElement)
          .getAllByRole("cell")
          .map((cell) => cell.textContent),
      ).toEqual([
        "Clasificador",
        "Entrada de imagen",
        'El nodo "Clasificador" necesita una imagen de entrada.',
      ]);
      expect(
        within(second as HTMLElement)
          .getAllByRole("cell")
          .map((cell) => cell.textContent),
      ).toEqual(["Workflow", "—", "El workflow necesita al menos un nodo de salida."]);
      expect(screen.queryByText("El workflow está listo para publicarse.")).toBeNull();
    });

    it("reports a failed validation request without showing a result", async () => {
      mockValidation(async () => {
        throw new Error("network");
      });

      render(workflowDetailPanel());
      await screen.findByTestId("workflow-detail-header");
      fireEvent.click(screen.getByRole("button", { name: "Validar workflow" }));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith(
          "No pudimos validar el workflow. Inténtalo nuevamente.",
        );
      });
      expect(screen.getByRole("button", { name: "Validar workflow" })).toBeTruthy();
      expect(screen.queryByRole("region", { name: "Errores de validación" })).toBeNull();
    });
  });

  describe("US-036: Publicar una versión de workflow", () => {
    const publishedVersion = {
      id: "version-1",
      workflowId: "workflow-1",
      version: "1.0.0",
      createdAt: "2026-09-24T12:00:00.000Z",
    };
    const workflowDetail = {
      workflow: {
        id: "workflow-1",
        applicationId: "app-1",
        name: "Diagnóstico de hoja de café",
        status: "draft",
        createdAt: "2026-09-21T15:00:00.000Z",
        updatedAt: "2026-09-21T16:00:00.000Z",
      },
      draft: { nodes: [] },
      versions: [] as (typeof publishedVersion)[],
    };
    const versionsUrl = "/applications/app-1/workflows/workflow-1/versions";

    function workflowDetailPanel({
      application = activeApp,
      canManage = true,
    }: {
      application?: Application;
      canManage?: boolean;
    } = {}) {
      return (
        <TooltipProvider>
          <ApplicationDetailPanel
            application={application}
            workspaceName="Laboratorio Andino"
            canManage={canManage}
            activeSection="workflows"
            workflowId="workflow-1"
            onBack={vi.fn()}
            onApplicationUpdated={vi.fn()}
            onApplicationArchived={vi.fn()}
          />
        </TooltipProvider>
      );
    }

    function mockDetail(detail = workflowDetail) {
      client.get.mockImplementation(async (url: string) => {
        if (url === "/applications/app-1/models") return { data: { models: [] } };
        return { data: detail };
      });
    }

    async function openPublishDialog(version: string) {
      await screen.findByTestId("workflow-detail-header");
      fireEvent.click(screen.getByRole("button", { name: "Publicar versión" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText("Versión"), { target: { value: version } });
      return dialog;
    }

    function rejection(status: number, data: unknown) {
      return Object.assign(new Error("Request failed"), {
        isAxiosError: true,
        response: { status, data },
      });
    }

    it("offers Publicar versión only to administrators of an active application", async () => {
      mockDetail();

      render(workflowDetailPanel());
      await screen.findByTestId("workflow-detail-header");
      expect(screen.getByRole("button", { name: "Publicar versión" })).toBeTruthy();
      cleanup();

      render(workflowDetailPanel({ canManage: false }));
      await screen.findByTestId("workflow-detail-header");
      expect(screen.queryByRole("button", { name: "Publicar versión" })).toBeNull();
      cleanup();

      render(workflowDetailPanel({ application: archivedApp }));
      await screen.findByTestId("workflow-detail-header");
      expect(screen.queryByRole("button", { name: "Publicar versión" })).toBeNull();
    });

    it("publishes a version from the dialog and lists it under Versiones publicadas", async () => {
      mockDetail();
      let resolvePublish: (value: unknown) => void = () => {};
      client.post.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePublish = resolve;
        }),
      );
      const user = userEvent.setup();

      render(workflowDetailPanel());
      const dialog = await openPublishDialog(" 1.0.0 ");
      expect(
        within(dialog).getByText("Se publicará una versión inmutable del workflow."),
      ).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("button", { name: "Publicar versión" }));

      const pending = await within(dialog).findByRole("button", { name: "Publicando versión…" });
      expect((pending as HTMLButtonElement).disabled).toBe(true);
      expect(client.post).toHaveBeenCalledWith(versionsUrl, { version: "1.0.0" });

      resolvePublish({ data: { version: publishedVersion } });

      await waitFor(() => {
        expect(toastMock.success).toHaveBeenCalledWith("Versión 1.0.0 publicada.");
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      await user.click(screen.getByRole("tab", { name: "Versiones publicadas" }));
      const table = screen.getByRole("table", { name: "Versiones publicadas" });
      expect(
        within(table)
          .getAllByRole("cell")
          .map((cell) => cell.textContent),
      ).toEqual(["1.0.0", formatLongDateEs("2026-09-24T12:00:00.000Z")]);
      expect(screen.queryByText("Aún no hay versiones publicadas.")).toBeNull();
    });

    it("lists the versions already published, most recent first", async () => {
      mockDetail({
        ...workflowDetail,
        versions: [{ ...publishedVersion, id: "version-2", version: "1.1.0" }, publishedVersion],
      });
      const user = userEvent.setup();

      render(workflowDetailPanel({ canManage: false }));
      await user.click(await screen.findByRole("tab", { name: "Versiones publicadas" }));

      const rows = within(screen.getByRole("table", { name: "Versiones publicadas" })).getAllByRole(
        "row",
      );
      expect(rows.map((row) => row.firstElementChild?.textContent)).toEqual([
        "Versión",
        "1.1.0",
        "1.0.0",
      ]);
    });

    it("rejects an unpublishable draft and shows its validation errors", async () => {
      mockDetail();
      client.post.mockRejectedValueOnce(
        rejection(409, {
          message: "Corrige los errores de validación antes de publicar.",
          code: "workflowInvalid",
          errors: [
            {
              code: "missingOutput",
              nodeId: null,
              nodeName: null,
              port: null,
              message: "El workflow necesita al menos un nodo de salida.",
            },
          ],
        }),
      );

      render(workflowDetailPanel());
      const dialog = await openPublishDialog("1.0.0");
      fireEvent.click(within(dialog).getByRole("button", { name: "Publicar versión" }));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith(
          "Corrige los errores de validación antes de publicar.",
        );
      });
      const panel = await screen.findByRole("region", { name: "Errores de validación" });
      expect(
        within(panel).getByText("El workflow necesita al menos un nodo de salida."),
      ).toBeTruthy();
      expect(toastMock.success).not.toHaveBeenCalled();
    });

    it("keeps the dialog open with the server message when the version already exists", async () => {
      mockDetail({ ...workflowDetail, versions: [publishedVersion] });
      client.post.mockRejectedValueOnce(
        rejection(409, {
          message: "Este workflow ya tiene una versión 1.0.0.",
          code: "versionExists",
        }),
      );

      render(workflowDetailPanel());
      const dialog = await openPublishDialog("1.0.0");
      fireEvent.click(within(dialog).getByRole("button", { name: "Publicar versión" }));

      expect(
        await within(dialog).findByText("Este workflow ya tiene una versión 1.0.0."),
      ).toBeTruthy();
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(toastMock.success).not.toHaveBeenCalled();
    });

    it("requires a version before calling the server and closes via Cancelar", async () => {
      mockDetail();

      render(workflowDetailPanel());
      const dialog = await openPublishDialog("   ");
      fireEvent.click(within(dialog).getByRole("button", { name: "Publicar versión" }));

      expect(
        await within(dialog).findByText(
          "Ingresa una versión con formato SemVer, por ejemplo 1.0.0.",
        ),
      ).toBeTruthy();
      expect(client.post).not.toHaveBeenCalled();

      fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    });
  });
});
