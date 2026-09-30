// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "../../types";
import { PrivacyTreatmentMapView } from "./privacy-treatment-map-view";

const { client, toastMock } = vi.hoisted(() => ({
  client: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
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

const emptyMap = {
  applicationId: "app-1",
  treatments: [],
  readyToPublish: false,
  latestPublishedVersion: 0,
  updatedAt: null,
};

describe("US-151: Privacy treatment map", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: () => "550e8400-e29b-41d4-a716-446655440000" });
    client.get.mockResolvedValue({ data: { map: emptyMap } });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads, records treatment details and saves the map", async () => {
    const savedMap = {
      applicationId: "app-1",
      treatments: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          purpose: "Telemetría técnica",
          dataCategories: ["Versión del SDK"],
          dataContext: "ayniPlatform",
          source: "Dispositivo",
          requirement: "optional",
          legalBasis: "Base verificada",
          legalBasisConfirmed: true,
          role: "processor",
          roleEntity: "Ayni S.A.C.",
          policyLinks: [{ label: "Privacidad", url: "https://example.test/privacy" }],
          recipients: ["Ninguno"],
          transfers: "No aplica",
          retention: "30 días",
          rightsChannel: "privacidad@example.test",
        },
      ],
      readyToPublish: true,
      latestPublishedVersion: 0,
      updatedAt: "2026-09-30T12:00:00.000Z",
    };
    client.put.mockResolvedValueOnce({ data: { map: savedMap } });

    render(<PrivacyTreatmentMapView application={activeApp} canManage />);
    await screen.findByText("Aún no se han registrado tratamientos.");
    fireEvent.click(screen.getByRole("button", { name: "Agregar tratamiento" }));
    fireEvent.change(screen.getByLabelText("Finalidad"), {
      target: { value: "Telemetría técnica" },
    });
    fireEvent.change(screen.getByLabelText("Categorías de datos (una por línea)"), {
      target: { value: "Versión del SDK" },
    });
    fireEvent.change(screen.getByLabelText("¿De quién son los datos?"), {
      target: { value: "ayniPlatform" },
    });
    fireEvent.change(screen.getByLabelText("Fuente de los datos"), {
      target: { value: "Dispositivo" },
    });
    fireEvent.change(screen.getByLabelText("¿El dato es obligatorio?"), {
      target: { value: "optional" },
    });
    fireEvent.change(screen.getByLabelText("Rol de Ayni o de la aplicación"), {
      target: { value: "processor" },
    });
    fireEvent.change(screen.getByLabelText("Nombre de la entidad que declara el rol"), {
      target: { value: "Ayni S.A.C." },
    });
    fireEvent.change(screen.getByLabelText("Políticas aplicables (una por línea: Nombre | URL)"), {
      target: { value: "Privacidad | https://example.test/privacy" },
    });
    fireEvent.change(
      screen.getByLabelText("Base aplicable (déjala vacía si está por determinar)"),
      {
        target: { value: "Base verificada" },
      },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Base revisada y confirmada" }));
    fireEvent.change(screen.getByLabelText(/Destinatarios o encargados/), {
      target: { value: "Ninguno" },
    });
    fireEvent.change(screen.getByLabelText("Transferencias nacionales o internacionales"), {
      target: { value: "No aplica" },
    });
    fireEvent.change(screen.getByLabelText("Periodo de conservación"), {
      target: { value: "30 días" },
    });
    fireEvent.change(screen.getByLabelText("Canal para ejercer derechos"), {
      target: { value: "privacidad@example.test" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Guardar mapa de tratamientos" }));

    await waitFor(() => {
      expect(client.put).toHaveBeenCalledWith("/applications/app-1/privacy-treatment-map", {
        treatments: savedMap.treatments,
      });
      expect(toastMock.success).toHaveBeenCalledWith("Mapa de tratamientos guardado.");
      expect(
        screen.getByText("El mapa está completo para publicar un aviso de privacidad."),
      ).toBeTruthy();
    });
  });

  it("preserves line breaks while entering multiple privacy policies", async () => {
    client.put.mockResolvedValueOnce({ data: { map: emptyMap } });
    render(<PrivacyTreatmentMapView application={activeApp} canManage />);
    await screen.findByText("Aún no se han registrado tratamientos.");
    fireEvent.click(screen.getByRole("button", { name: "Agregar tratamiento" }));
    const policies = screen.getByLabelText("Políticas aplicables (una por línea: Nombre | URL)");
    fireEvent.change(policies, {
      target: { value: "Privacidad | https://example.test/privacy\n" },
    });
    expect((policies as HTMLTextAreaElement).value).toBe(
      "Privacidad | https://example.test/privacy\n",
    );
    fireEvent.change(policies, {
      target: {
        value:
          "Privacidad | https://example.test/privacy\nTérminos de uso | https://example.test/terms",
      },
    });

    expect((policies as HTMLTextAreaElement).value).toBe(
      "Privacidad | https://example.test/privacy\nTérminos de uso | https://example.test/terms",
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar mapa de tratamientos" }));
    await waitFor(() => {
      expect(client.put).toHaveBeenCalledWith(
        "/applications/app-1/privacy-treatment-map",
        expect.objectContaining({
          treatments: [
            expect.objectContaining({
              policyLinks: [
                { label: "Privacidad", url: "https://example.test/privacy" },
                { label: "Términos de uso", url: "https://example.test/terms" },
              ],
            }),
          ],
        }),
      );
    });
  });

  it("keeps the map read-only for members and archived applications", async () => {
    render(<PrivacyTreatmentMapView application={activeApp} canManage={false} />);
    await screen.findByText("Aún no se han registrado tratamientos.");
    expect(
      screen.getByRole("button", { name: "Agregar tratamiento" }).hasAttribute("disabled"),
    ).toBe(true);

    cleanup();
    render(
      <PrivacyTreatmentMapView application={{ ...activeApp, status: "archived" }} canManage />,
    );
    await screen.findByText("Aún no se han registrado tratamientos.");
    expect(
      screen.getByRole("button", { name: "Agregar tratamiento" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("shows the required confirmation warning and names pending treatment details", async () => {
    client.get.mockResolvedValueOnce({
      data: {
        map: {
          ...emptyMap,
          treatments: [
            {
              id: "550e8400-e29b-41d4-a716-446655440000",
              purpose: "Analítica",
              dataCategories: [],
              dataContext: "undetermined",
              source: "",
              requirement: "undetermined",
              legalBasis: "",
              legalBasisConfirmed: false,
              role: "undetermined",
              roleEntity: "",
              policyLinks: [],
              recipients: [],
              transfers: "",
              retention: "",
              rightsChannel: "",
            },
          ],
        },
      },
    });

    render(<PrivacyTreatmentMapView application={activeApp} canManage />);
    expect(
      await screen.findByText(
        /Confirma estos datos con la persona responsable de privacidad antes de publicar el aviso\./,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Pendiente: categorías de datos, titular de los datos, fuente, obligatoriedad, base aplicable confirmada, rol, nombre de la entidad responsable o encargada, destinatarios, transferencias, conservación, canal de derechos.",
      ),
    ).toBeTruthy();
  });

  it("publishes an immutable notice version only from the saved map", async () => {
    client.get.mockResolvedValueOnce({
      data: {
        map: {
          ...emptyMap,
          readyToPublish: true,
          treatments: [
            {
              id: "550e8400-e29b-41d4-a716-446655440000",
              purpose: "Telemetría técnica",
              dataCategories: ["Versión del SDK"],
              dataContext: "ayniPlatform",
              source: "Dispositivo",
              requirement: "optional",
              legalBasis: "Base revisada",
              legalBasisConfirmed: true,
              role: "processor",
              roleEntity: "Ayni S.A.C.",
              policyLinks: [],
              recipients: ["Ninguno"],
              transfers: "No aplica",
              retention: "30 días",
              rightsChannel: "privacidad@example.test",
            },
          ],
        },
      },
    });
    client.post.mockResolvedValueOnce({
      data: { version: { version: 1, publishedAt: "2026-09-30T12:00:00.000Z" } },
    });

    render(<PrivacyTreatmentMapView application={activeApp} canManage />);
    fireEvent.click(await screen.findByRole("button", { name: "Publicar aviso de privacidad" }));

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith("/applications/app-1/privacy-notice/publish");
      expect(toastMock.success).toHaveBeenCalledWith("Aviso de privacidad versión 1 publicado.");
      expect(screen.getByText(/Versión publicada: 1/)).toBeTruthy();
    });
  });
});
