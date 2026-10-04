// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "../../types";
import { ApplicationDetailPanel } from "../application-detail-panel";
import { TelemetryPolicyView } from "./telemetry-policy-view";

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
  retentionDays: 30,
  updatedAt: null,
};

function axiosError(status: number, message?: string) {
  return {
    isAxiosError: true,
    response: { status, data: message ? { message } : {} },
  };
}

function toggle() {
  return screen.getByRole("switch", { name: "Permitir telemetría técnica" }) as HTMLInputElement;
}

function retention() {
  return screen.getByLabelText("Periodo de retención") as HTMLSelectElement;
}

function savedResponse(policy: Partial<typeof savedPolicy>) {
  return {
    data: {
      policy: { ...savedPolicy, updatedAt: "2026-09-26T12:00:00.000Z", ...policy },
    },
  };
}

function policyCancel() {
  return within(screen.getByRole("form", { name: "Política de telemetría" })).getByRole("button", {
    name: "Cancelar",
  });
}

function retentionForm() {
  return within(screen.getByRole("form", { name: "Retención" }));
}

async function renderView(props: Partial<Parameters<typeof TelemetryPolicyView>[0]> = {}) {
  render(<TelemetryPolicyView application={activeApp} canManage {...props} />);
  await screen.findByRole("switch", { name: "Permitir telemetría técnica" });
}

describe("US-100: Configurar la política de telemetría", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.get.mockReset();
    client.patch.mockReset();
    client.get.mockResolvedValue({ data: { policy: savedPolicy } });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the saved policy with the switch, the retention selector and the raw-data notice", async () => {
    await renderView();

    expect(client.get).toHaveBeenCalledWith(
      "/applications/app-1/telemetry-policy",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByRole("heading", { name: "Privacidad y telemetría" })).toBeTruthy();
    expect(toggle().checked).toBe(false);
    expect(retention().value).toBe("30");
    expect(
      Array.from(retention().options).map((option) => [option.value, option.textContent]),
    ).toEqual([
      ["7", "7 días"],
      ["30", "30 días"],
      ["90", "90 días"],
    ]);
    expect(screen.getByText("La telemetría no incluye imágenes ni entradas crudas.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Guardar política" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("lets an administrator enable telemetry without sending the retention", async () => {
    client.patch.mockResolvedValue(savedResponse({ enabled: true }));
    await renderView();

    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Guardar política" }));

    expect(await screen.findByRole("button", { name: "Guardando política…" })).toBeTruthy();
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Política de telemetría actualizada."),
    );
    expect(client.patch).toHaveBeenCalledWith("/applications/app-1/telemetry-policy", {
      enabled: true,
    });
    expect(toggle().checked).toBe(true);
    expect(retention().value).toBe("30");
    expect(
      (screen.getByRole("button", { name: "Guardar política" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("restores the saved policy on Cancelar without sending anything", async () => {
    await renderView();

    fireEvent.click(toggle());
    fireEvent.click(policyCancel());

    expect(toggle().checked).toBe(false);
    expect(client.patch).not.toHaveBeenCalled();
  });

  it("keeps the previous policy when the server rejects the change", async () => {
    client.patch.mockRejectedValue(
      axiosError(403, "No tienes permiso para cambiar la política de telemetría."),
    );
    await renderView();

    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Guardar política" }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "No tienes permiso para cambiar la política de telemetría.",
      ),
    );
    expect(toastMock.success).not.toHaveBeenCalled();
    fireEvent.click(policyCancel());
    expect(toggle().checked).toBe(false);
  });

  it("falls back to a generic message when the save fails without a server message", async () => {
    client.patch.mockRejectedValue(new Error("network"));
    await renderView();

    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Guardar política" }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "No pudimos guardar la política de telemetría. Inténtalo nuevamente.",
      ),
    );
    expect(toggle().checked).toBe(true);
  });

  it("shows a plain member the policy read-only", async () => {
    client.get.mockResolvedValue({ data: { policy: { ...savedPolicy, enabled: true } } });
    await renderView({ canManage: false });

    expect(toggle().checked).toBe(true);
    expect(toggle().disabled).toBe(true);
    expect(retention().disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Guardar política" })).toBeNull();
    expect(
      screen.getByText("Solo los administradores pueden cambiar la política de telemetría."),
    ).toBeTruthy();
  });

  it("does not let administrators change the policy of an archived application", async () => {
    await renderView({ application: { ...activeApp, status: "archived" } });

    expect(toggle().disabled).toBe(true);
    expect(retention().disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Guardar política" })).toBeNull();
    expect(
      screen.getByText(
        "La aplicación está archivada: su política de telemetría no se puede cambiar.",
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
    render(<TelemetryPolicyView application={activeApp} canManage />);

    expect(screen.getByText("Cargando política de telemetría…")).toBeTruthy();
    rejectLoad(new Error("network"));
    expect(
      await screen.findByText("No pudimos cargar la política de telemetría. Inténtalo nuevamente."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("switch", { name: "Permitir telemetría técnica" })).toBeTruthy();
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it("is the application's Privacidad y telemetría section", async () => {
    render(
      <ApplicationDetailPanel
        application={activeApp}
        canManage
        activeSection="privacy"
        onApplicationUpdated={vi.fn()}
        onApplicationArchived={vi.fn()}
      />,
    );

    expect(await screen.findByRole("switch", { name: "Permitir telemetría técnica" })).toBeTruthy();
  });
});

describe("US-112: Aplicar retención de telemetría", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.get.mockReset();
    client.patch.mockReset();
    client.get.mockResolvedValue({ data: { policy: { ...savedPolicy, enabled: true } } });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the period selector with its help under Retención", async () => {
    await renderView();

    expect(screen.getByRole("heading", { name: "Retención" })).toBeTruthy();
    expect(retention().value).toBe("30");
    expect(
      retentionForm().getByText("Las trazas vencidas dejarán de estar disponibles."),
    ).toBeTruthy();
    expect(retention().getAttribute("aria-describedby")).toBe("telemetry-retention-help");
    expect(
      (retentionForm().getByRole("button", { name: "Guardar retención" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("saves only the retention period and keeps the switch", async () => {
    client.patch.mockResolvedValue(savedResponse({ enabled: true, retentionDays: 7 }));
    await renderView();

    fireEvent.change(retention(), { target: { value: "7" } });
    fireEvent.click(retentionForm().getByRole("button", { name: "Guardar retención" }));

    expect(
      await retentionForm().findByRole("button", { name: "Guardando retención…" }),
    ).toBeTruthy();
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Retención actualizada."));
    expect(client.patch).toHaveBeenCalledWith("/applications/app-1/telemetry-policy", {
      retentionDays: 7,
    });
    expect(retention().value).toBe("7");
    expect(toggle().checked).toBe(true);
    expect(
      (retentionForm().getByRole("button", { name: "Guardar retención" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("keeps the previous period when the server rejects it", async () => {
    client.patch.mockRejectedValue(axiosError(400, "Selecciona un periodo de retención válido."));
    await renderView();

    fireEvent.change(retention(), { target: { value: "90" } });
    fireEvent.click(retentionForm().getByRole("button", { name: "Guardar retención" }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("Selecciona un periodo de retención válido."),
    );
    expect(toastMock.success).not.toHaveBeenCalled();
    fireEvent.click(retentionForm().getByRole("button", { name: "Cancelar" }));
    expect(retention().value).toBe("30");
  });

  it("falls back to a generic message when saving the period fails", async () => {
    client.patch.mockRejectedValue(new Error("network"));
    await renderView();

    fireEvent.change(retention(), { target: { value: "90" } });
    fireEvent.click(retentionForm().getByRole("button", { name: "Guardar retención" }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "No pudimos guardar la retención. Inténtalo nuevamente.",
      ),
    );
  });

  it("keeps an unsaved switch change when the period is saved", async () => {
    client.patch.mockResolvedValue(savedResponse({ enabled: true, retentionDays: 90 }));
    await renderView();

    fireEvent.click(toggle());
    fireEvent.change(retention(), { target: { value: "90" } });
    fireEvent.click(retentionForm().getByRole("button", { name: "Guardar retención" }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Retención actualizada."));
    expect(toggle().checked).toBe(false);
    expect(
      (screen.getByRole("button", { name: "Guardar política" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("does not let a plain member change the period", async () => {
    await renderView({ canManage: false });

    expect(retention().disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Guardar retención" })).toBeNull();
  });

  it("does not let administrators change the period of an archived application", async () => {
    await renderView({ application: { ...activeApp, status: "archived" } });

    expect(retention().disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Guardar retención" })).toBeNull();
  });
});

describe("US-073: Enviar solo telemetría sin nodo de captura", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.get.mockReset();
    client.get.mockResolvedValue({ data: { policy: { ...savedPolicy, enabled: true } } });
  });

  afterEach(() => {
    cleanup();
  });

  it("clarifies that telemetry carries no input images and names the only node that collects them", async () => {
    await renderView({ canManage: false });

    expect(screen.getByText("La telemetría no incluye imágenes de entrada.")).toBeTruthy();
    expect(
      screen.getByText(
        "Las imágenes solo se recolectan en workflows con el nodo Capturar evidencia, según la política de Recolección de evidencia.",
      ),
    ).toBeTruthy();
  });
});
