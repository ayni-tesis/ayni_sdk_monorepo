// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "../../types";
import { PrivacyRightsRequestsView } from "./privacy-rights-requests-view";

const { client } = vi.hoisted(() => ({ client: { get: vi.fn(), patch: vi.fn() } }));
vi.mock("@/lib/http-client", () => ({ httpClient: client }));

const application: Application = {
  id: "app-1",
  organizationId: "org-1",
  name: "Aplicación",
  status: "active",
};
const request = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  noticeVersion: 2,
  purpose: "Atender solicitudes",
  responsibleEntity: "Responsable de la aplicación",
  rightsChannel: "derechos@example.test",
  type: "access" as const,
  contactEmail: "titular@example.test",
  details: "Consulta sobre datos.",
  status: "received" as const,
  response: "",
  reason: "",
  createdAt: "2026-09-30T12:00:00.000Z",
  updatedAt: "2026-09-30T12:00:00.000Z",
  updatedById: null,
};

describe("US-156 privacy rights request management", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("keeps request details hidden from members", () => {
    render(<PrivacyRightsRequestsView application={application} />);
    expect(screen.getByText(/Solo administradores y propietarios/)).toBeTruthy();
    expect(client.get).not.toHaveBeenCalled();
  });

  it("lets an administrator answer and records the response", async () => {
    client.get.mockResolvedValue({ data: { requests: [request], hasMore: true } });
    client.patch.mockResolvedValue({
      data: {
        request: {
          ...request,
          status: "answered",
          response: "Revisa el mensaje enviado por el responsable.",
          updatedById: "admin-1",
        },
      },
    });
    render(<PrivacyRightsRequestsView application={application} canManage />);

    await screen.findByText(/titular@example\.test/);
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "answered" } });
    fireEvent.change(screen.getByLabelText("Respuesta"), {
      target: { value: "Revisa el mensaje enviado por el responsable." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar actualización" }));

    expect(await screen.findByText("Estado: Respondida")).toBeTruthy();
    expect(client.patch).toHaveBeenCalledWith(
      `/applications/app-1/privacy-requests/${request.id}`,
      {
        status: "answered",
        response: "Revisa el mensaje enviado por el responsable.",
        reason: "",
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Siguientes" }));
    await screen.findByText("Página 2");
    expect(client.get).toHaveBeenLastCalledWith(
      "/applications/app-1/privacy-requests?page=2",
      expect.anything(),
    );
  });
});
