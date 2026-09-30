// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyRightsRequestForm } from "./privacy-rights-request-form";

const { client } = vi.hoisted(() => ({ client: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/http-client", () => ({ httpClient: client }));

const treatments = [
  {
    id: "550e8400-e29b-41d4-a716-446655440000",
    purpose: "Atender solicitudes",
    dataContext: "clientApplication",
    roleEntity: "Responsable de la aplicación",
    rightsChannel: "derechos@example.test",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440002",
    purpose: "Operación de Ayni",
    dataContext: "ayniPlatform",
    roleEntity: "Ayni",
    rightsChannel: "privacidad@example.test",
  },
];

describe("US-156 public rights request form", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("routes requests to the selected client treatment and lets the holder check status", async () => {
    client.post.mockResolvedValue({
      data: {
        requestNumber: "550e8400-e29b-41d4-a716-446655440001",
        message: "Solicitud recibida. Guarda este número en un lugar privado para consultar su estado y respuesta.",
      },
    });
    client.get.mockResolvedValue({
      data: {
        request: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          type: "access",
          status: "answered",
          response: "Respondimos por el canal declarado.",
          reason: "",
          createdAt: "2026-09-30T12:00:00.000Z",
        },
      },
    });
    render(<PrivacyRightsRequestForm applicationId="app-1" treatments={treatments} />);

    expect(screen.getAllByRole("option")[0]?.textContent).toContain("Responsable de la aplicación");
    expect(screen.getAllByText(/Canal publicado: derechos@example.test/).length).toBe(1);
    fireEvent.change(screen.getByLabelText("Correo de contacto"), {
      target: { value: "titular@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    await screen.findByText("550e8400-e29b-41d4-a716-446655440001");
    expect(client.post).toHaveBeenCalledWith(
      "/applications/app-1/privacy-requests",
      expect.objectContaining({
        treatmentId: treatments[0]?.id,
        type: "access",
        contactEmail: "titular@example.test",
      }),
    );
    expect(client.post.mock.calls[0]?.[1]).not.toHaveProperty("nationalId");

    fireEvent.change(screen.getByLabelText("Número de solicitud"), {
      target: { value: "550e8400-e29b-41d4-a716-446655440001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    await screen.findByText("Respuesta: Respondimos por el canal declarado.");
    expect(client.get).toHaveBeenCalledWith(
      "/privacy-requests/550e8400-e29b-41d4-a716-446655440001",
    );
  });

  it("shows the specified error and leaves the request form available after failure", async () => {
    client.post.mockRejectedValue(new Error("offline"));
    render(<PrivacyRightsRequestForm applicationId="app-1" treatments={treatments} />);
    fireEvent.change(screen.getByLabelText("Correo de contacto"), {
      target: { value: "titular@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "No pudimos registrar la solicitud. Inténtalo nuevamente o usa el canal de contacto del responsable.",
      ),
    );
  });
});
