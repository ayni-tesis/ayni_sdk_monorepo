// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Application } from "../types";
import { WorkspaceHeader } from "./workspace-header";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
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

describe("WorkspaceHeader", () => {
  afterEach(() => {
    cleanup();
  });

  const appOne: Application = {
    id: "app-1",
    organizationId: "org-1",
    name: "Cámara",
    status: "active",
  };
  const appTwo: Application = {
    id: "app-2",
    organizationId: "org-1",
    name: "Sensores",
    status: "active",
  };

  function renderHeader(props: Partial<Parameters<typeof WorkspaceHeader>[0]> = {}) {
    return render(
      <SidebarProvider>
        <TooltipProvider>
          <WorkspaceHeader userName="Diego" workspaceName="Laboratorio Andino" {...props} />
        </TooltipProvider>
      </SidebarProvider>,
    );
  }

  it("shows the user name and the workspace as the current page when no application is open", () => {
    renderHeader({ activeView: "applications" });

    expect(screen.getByText("Diego")).toBeTruthy();
    expect(screen.getByText("Workspace actual")).toBeTruthy();
    expect(screen.getByText("Laboratorio Andino")).toBeTruthy();
    expect(screen.getByText("Aplicaciones")).toBeTruthy();
  });

  it("labels the section crumb for the members view", () => {
    renderHeader({ activeView: "members" });

    expect(screen.getByText("Miembros")).toBeTruthy();
  });

  it("links back to the dashboard and shows the section crumb when an application is open", () => {
    const onNavigateHome = vi.fn();
    renderHeader({
      selectedApplication: appOne,
      applications: [appOne],
      activeView: "models",
      onNavigateHome,
    });

    expect(screen.getByText("Cámara")).toBeTruthy();
    expect(screen.getByText("Modelos")).toBeTruthy();

    const workspaceLink = screen.getByRole("link", { name: "Laboratorio Andino" });
    expect(workspaceLink.getAttribute("href")).toBe("/dashboard");
    fireEvent.click(workspaceLink);
    expect(onNavigateHome).toHaveBeenCalled();
  });

  it("does not repeat a section crumb on the application overview", () => {
    renderHeader({
      selectedApplication: appOne,
      applications: [appOne],
      activeView: "overview",
    });

    expect(screen.getByText("Cámara")).toBeTruthy();
    expect(screen.queryByText("Resumen")).toBeNull();
    expect(screen.queryByText("Aplicaciones")).toBeNull();
  });

  it("lists other applications in the dropdown and selects one", async () => {
    const onSelectApplication = vi.fn();
    renderHeader({
      selectedApplication: appOne,
      applications: [appOne, appTwo],
      activeView: "overview",
      onSelectApplication,
    });

    fireEvent.click(screen.getByText("Cámara"));

    const option = await screen.findByRole("menuitem", { name: /sensores/i });
    fireEvent.click(option);
    expect(onSelectApplication).toHaveBeenCalledWith("app-2");
  });

  it("shows a 'ver todas' option that navigates home", async () => {
    const onNavigateHome = vi.fn();
    renderHeader({
      selectedApplication: appOne,
      applications: [appOne, appTwo],
      activeView: "overview",
      onNavigateHome,
    });

    fireEvent.click(screen.getByText("Cámara"));

    const allItem = await screen.findByRole("menuitem", { name: /ver todas las aplicaciones/i });
    fireEvent.click(allItem);
    expect(onNavigateHome).toHaveBeenCalled();
  });
});
