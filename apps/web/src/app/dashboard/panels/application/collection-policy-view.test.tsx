// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "../../types";
import { ApplicationDetailPanel } from "../application-detail-panel";
import { CollectionPolicyView } from "./collection-policy-view";

const { client, toastMock } = vi.hoisted(() => ({
  client: { get: vi.fn(), patch: vi.fn() },
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/http-client", () => ({ httpClient: client }));
vi.mock("sonner", () => ({ toast: toastMock }));

const activeApp: Application = {
  id: "app-1",
  organizationId: "org-1",
  name: "Cámara",
  status: "active",
};

const savedPolicy = {
  applicationId: "app-1",
  enabled: false,
  consentRequired: false,
  network: "wifi",
  maxImageSize: 1024,
  imageQuality: 80,
  updatedAt: null,
};

function axiosError(status: number, message?: string) {
  return {
    isAxiosError: true,
    response: { status, data: message ? { message } : {} },
  };
}

function toggle() {
  return screen.getByRole("switch", {
    name: "Permitir captura de imágenes para datasets",
  }) as HTMLInputElement;
}

function consent() {
  return screen.getByRole("checkbox", {
    name: "Exigir el consentimiento del usuario antes de capturar",
  }) as HTMLInputElement;
}

function network() {
  return screen.getByLabelText("Red permitida") as HTMLSelectElement;
}

function maxSize() {
  return screen.getByLabelText("Tamaño máximo") as HTMLInputElement;
}

function quality() {
  return screen.getByLabelText("Calidad") as HTMLInputElement;
}

function saveButton() {
  return screen.getByRole("button", { name: "Guardar política" }) as HTMLButtonElement;
}

async function renderView(props: Partial<Parameters<typeof CollectionPolicyView>[0]> = {}) {
  render(<CollectionPolicyView application={activeApp} canManage {...props} />);
  await screen.findByRole("switch", { name: "Permitir captura de imágenes para datasets" });
}

describe("US-063: Configurar la política de recolección", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.get.mockReset();
    client.patch.mockReset();
    client.get.mockResolvedValue({ data: { policy: savedPolicy } });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the saved policy with its fields and the mandatory notice", async () => {
    await renderView();

    expect(client.get).toHaveBeenCalledWith(
      "/applications/app-1/collection-policy",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByRole("heading", { name: "Privacidad y recolección" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recolección de evidencia" })).toBeTruthy();
    expect(toggle().checked).toBe(false);
    expect(consent().checked).toBe(false);
    expect(network().value).toBe("wifi");
    expect(
      Array.from(network().options).map((option) => [option.value, option.textContent]),
    ).toEqual([
      ["wifi", "Solo Wi-Fi"],
      ["wifiAndCellular", "Wi-Fi y datos móviles"],
    ]);
    expect(maxSize().value).toBe("1024");
    expect(quality().value).toBe("80");
    expect(
      screen.getByText(
        "Las imágenes se subirán solo desde workflows que incluyan dataset.capture y con consentimiento.",
      ),
    ).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it("lets an administrator enable collection with consent, quality and network", async () => {
    const enabledPolicy = {
      enabled: true,
      consentRequired: true,
      network: "wifiAndCellular",
      maxImageSize: 640,
      imageQuality: 75,
    };
    client.patch.mockResolvedValue({
      data: {
        policy: { applicationId: "app-1", ...enabledPolicy, updatedAt: "2026-09-26T12:00:00.000Z" },
      },
    });
    await renderView();

    fireEvent.click(toggle());
    fireEvent.click(consent());
    fireEvent.change(network(), { target: { value: "wifiAndCellular" } });
    fireEvent.change(maxSize(), { target: { value: "640" } });
    fireEvent.change(quality(), { target: { value: "75" } });
    fireEvent.click(saveButton());

    expect(await screen.findByRole("button", { name: "Guardando política…" })).toBeTruthy();
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Política de recolección actualizada."),
    );
    expect(client.patch).toHaveBeenCalledWith(
      "/applications/app-1/collection-policy",
      enabledPolicy,
    );
    expect(toggle().checked).toBe(true);
    expect(consent().checked).toBe(true);
    expect(network().value).toBe("wifiAndCellular");
    expect(maxSize().value).toBe("640");
    expect(quality().value).toBe("75");
    expect(saveButton().disabled).toBe(true);
  });

  it("keeps collection disabled when the server rejects a policy without consent", async () => {
    client.patch.mockRejectedValue(
      axiosError(400, "La recolección exige una configuración explícita de consentimiento."),
    );
    await renderView();

    fireEvent.click(toggle());
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "La recolección exige una configuración explícita de consentimiento.",
      ),
    );
    expect(client.patch).toHaveBeenCalledWith(
      "/applications/app-1/collection-policy",
      expect.objectContaining({ enabled: true, consentRequired: false }),
    );
    expect(toastMock.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(toggle().checked).toBe(false);
  });

  it("sends an emptied number field as missing so the server names it", async () => {
    client.patch.mockRejectedValue(
      axiosError(400, "La calidad debe ser un número entero entre 10 y 100."),
    );
    await renderView();

    fireEvent.change(quality(), { target: { value: "" } });
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "La calidad debe ser un número entero entre 10 y 100.",
      ),
    );
    expect(client.patch).toHaveBeenCalledWith(
      "/applications/app-1/collection-policy",
      expect.objectContaining({ imageQuality: null }),
    );
  });

  it("restores the saved policy on Cancelar without sending anything", async () => {
    await renderView();

    fireEvent.click(toggle());
    fireEvent.click(consent());
    fireEvent.change(network(), { target: { value: "wifiAndCellular" } });
    fireEvent.change(maxSize(), { target: { value: "512" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(toggle().checked).toBe(false);
    expect(consent().checked).toBe(false);
    expect(network().value).toBe("wifi");
    expect(maxSize().value).toBe("1024");
    expect(client.patch).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the save fails without a server message", async () => {
    client.patch.mockRejectedValue(new Error("network"));
    await renderView();

    fireEvent.click(consent());
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "No pudimos guardar la política de recolección. Inténtalo nuevamente.",
      ),
    );
    expect(consent().checked).toBe(true);
  });

  it("shows a plain member the policy read-only", async () => {
    client.get.mockResolvedValue({
      data: { policy: { ...savedPolicy, enabled: true, consentRequired: true } },
    });
    await renderView({ canManage: false });

    expect(toggle().checked).toBe(true);
    for (const field of [toggle(), consent(), network(), maxSize(), quality()]) {
      expect(field.disabled).toBe(true);
    }
    expect(screen.queryByRole("button", { name: "Guardar política" })).toBeNull();
    expect(
      screen.getByText("Solo los administradores pueden cambiar la política de recolección."),
    ).toBeTruthy();
  });

  it("does not let administrators change the policy of an archived application", async () => {
    await renderView({ application: { ...activeApp, status: "archived" } });

    expect(toggle().disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Guardar política" })).toBeNull();
    expect(
      screen.getByText(
        "La aplicación está archivada: su política de recolección no se puede cambiar.",
      ),
    ).toBeTruthy();
  });

  it("shows the loading state, then a retryable error", async () => {
    let rejectLoad: (reason: unknown) => void = () => {};
    client.get.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectLoad = reject;
        }),
    );
    render(<CollectionPolicyView application={activeApp} canManage />);

    expect(screen.getByText("Cargando política de recolección…")).toBeTruthy();
    rejectLoad(new Error("network"));
    expect(
      await screen.findByText(
        "No pudimos cargar la política de recolección. Inténtalo nuevamente.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(
      await screen.findByRole("switch", { name: "Permitir captura de imágenes para datasets" }),
    ).toBeTruthy();
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it("is the application's Privacidad y recolección section", async () => {
    render(
      <ApplicationDetailPanel
        application={activeApp}
        canManage
        activeSection="collection"
        onApplicationUpdated={vi.fn()}
        onApplicationArchived={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("switch", { name: "Permitir captura de imágenes para datasets" }),
    ).toBeTruthy();
  });
});
