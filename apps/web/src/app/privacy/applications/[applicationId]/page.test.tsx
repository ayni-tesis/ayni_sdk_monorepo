// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ApplicationPrivacyNoticePage from "./page";

describe("application privacy notice page", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the current published notice snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          notice: {
            version: 2,
            publishedAt: "2026-09-30T00:00:00.000Z",
            treatments: [
              {
                id: "treatment-1",
                purpose: "Procesar imágenes",
                dataCategories: ["Imagen"],
                dataContext: "clientApplication",
                source: "Cámara",
                requirement: "required",
                legalBasis: "Base declarada",
                legalBasisConfirmed: true,
                role: "processor",
                roleEntity: "Ayni S.A.C.",
                policyLinks: [
                  { label: "Política de privacidad", url: "https://example.test/privacy" },
                ],
                recipients: ["Proveedor declarado"],
                transfers: "No declaradas",
                retention: "No declarada",
                rightsChannel: "privacidad@example.test",
              },
            ],
          },
        }),
      }),
    );

    const page = await ApplicationPrivacyNoticePage({
      params: Promise.resolve({ applicationId: "app-1" }),
    });
    render(page);

    expect(screen.getByRole("heading", { name: "Aviso de privacidad" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Finalidad 1: Procesar imágenes" })).toBeTruthy();
    expect(screen.getByText("Encargado declarado: Ayni S.A.C.")).toBeTruthy();
    expect(screen.getByText("Proveedor declarado")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Política de privacidad" }).getAttribute("href")).toBe(
      "https://example.test/privacy",
    );
  });

  it("explains when an application has not published a notice", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const page = await ApplicationPrivacyNoticePage({
      params: Promise.resolve({ applicationId: "app-1" }),
    });
    render(page);

    expect(screen.getByRole("alert").textContent).toBe(
      "La aplicación aún no publicó su aviso de privacidad.",
    );
  });
});
