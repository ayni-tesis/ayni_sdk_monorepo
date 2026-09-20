// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Application } from "../types";
import { ApplicationsPanel } from "./applications-panel";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});

describe("ApplicationsPanel", () => {
  afterEach(() => {
    cleanup();
  });

  const mockApplications: Application[] = [
    { id: "app-1", organizationId: "org-1", name: "Cámara", status: "active" },
    { id: "app-2", organizationId: "org-1", name: "Sensores", status: "archived" },
  ];

  it("lists applications and lets user select one", () => {
    const onSelect = vi.fn();
    render(
      <TooltipProvider>
        <ApplicationsPanel
          workspaceName="Laboratorio Andino"
          applications={mockApplications}
          onSelectApplication={onSelect}
          onCreateApplication={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("Laboratorio Andino")).toBeTruthy();
    expect(screen.getByText("Cámara")).toBeTruthy();
    expect(screen.getByText("Activa")).toBeTruthy();
    expect(screen.getByText("Sensores")).toBeTruthy();
    expect(screen.getByText("Archivada")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /cámara/i }));
    expect(onSelect).toHaveBeenCalledWith("app-1");
  });

  it("renders loading, error, and empty states", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <TooltipProvider>
        <ApplicationsPanel
          workspaceName="Laboratorio Andino"
          applications={[]}
          loading={true}
          onSelectApplication={vi.fn()}
          onCreateApplication={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("Cargando aplicaciones…")).toBeTruthy();

    rerender(
      <TooltipProvider>
        <ApplicationsPanel
          workspaceName="Laboratorio Andino"
          applications={[]}
          error="Error al conectar"
          onRetry={onRetry}
          onSelectApplication={vi.fn()}
          onCreateApplication={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("Error al conectar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(onRetry).toHaveBeenCalled();

    rerender(
      <TooltipProvider>
        <ApplicationsPanel
          workspaceName="Laboratorio Andino"
          applications={[]}
          canManage={true}
          onSelectApplication={vi.fn()}
          onCreateApplication={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("Aún no hay aplicaciones en este workspace.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /crear aplicación/i })).toBeTruthy();
  });

  it("opens create application dialog and submits with name", async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    render(
      <TooltipProvider>
        <ApplicationsPanel
          workspaceName="Laboratorio Andino"
          applications={mockApplications}
          canManage={true}
          onSelectApplication={vi.fn()}
          onCreateApplication={onCreate}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /nueva aplicación/i }));
    expect(screen.getByRole("dialog", { name: "Crear aplicación" })).toBeTruthy();

    const input = screen.getByLabelText("Nombre de la aplicación");
    fireEvent.change(input, { target: { value: "Nueva App" } });

    const form = input.closest("form");
    expect(form).toBeTruthy();
    if (form) fireEvent.submit(form);

    expect(onCreate).toHaveBeenCalledWith("Nueva App");
  });
});
