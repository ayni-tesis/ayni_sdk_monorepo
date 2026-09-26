// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  return screen.getByLabelText("Retención") as HTMLSelectElement;
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

  it("lets an administrator enable telemetry and saves the chosen retention", async () => {
    client.patch.mockResolvedValue({
      data: {
        policy: {
          applicationId: "app-1",
          enabled: true,
          retentionDays: 90,
          updatedAt: "2026-09-26T12:00:00.000Z",
        },
      },
    });
    await renderView();

    fireEvent.click(toggle());
    fireEvent.change(retention(), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar política" }));

    expect(await screen.findByRole("button", { name: "Guardando política…" })).toBeTruthy();
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Política de telemetría actualizada."),
    );
    expect(client.patch).toHaveBeenCalledWith("/applications/app-1/telemetry-policy", {
      enabled: true,
      retentionDays: 90,
    });
    expect(toggle().checked).toBe(true);
    expect(retention().value).toBe("90");
    expect(
      (screen.getByRole("button", { name: "Guardar política" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("restores the saved policy on Cancelar without sending anything", async () => {
    await renderView();

    fireEvent.click(toggle());
    fireEvent.change(retention(), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(toggle().checked).toBe(false);
    expect(retention().value).toBe("30");
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
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
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
