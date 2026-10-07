// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Application } from "@/app/dashboard/types";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "./app-sidebar";

const { mockUseReducedMotion } = vi.hoisted(() => ({
  mockUseReducedMotion: vi.fn(() => false),
}));

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: mockUseReducedMotion,
}));

vi.mock("@/components/workspace-switcher", () => ({
  WorkspaceSwitcher: () => null,
}));

function setReducedMotionPreference(reducedMotion: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reducedMotion && query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeAll(() => {
  setReducedMotionPreference(false);
});

describe("AppSidebar", () => {
  afterEach(() => {
    cleanup();
    mockUseReducedMotion.mockReturnValue(false);
    setReducedMotionPreference(false);
  });

  const application: Application = {
    id: "app-1",
    organizationId: "org-1",
    name: "Ayni",
    status: "active",
  };

  function renderSidebar(props: Partial<Parameters<typeof AppSidebar>[0]> = {}) {
    return render(
      <SidebarProvider>
        <TooltipProvider>
          <AppSidebar {...props} />
        </TooltipProvider>
      </SidebarProvider>,
    );
  }

  it("exposes its destinations through a named navigation landmark", () => {
    renderSidebar();

    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeTruthy();
  });

  it("announces the current view without marking other views current", () => {
    renderSidebar({ selectedApplication: application, activeView: "overview" });

    const navigation = screen.getByRole("navigation", { name: "Navegación principal" });

    expect(
      within(navigation).getByRole("button", { name: "Resumen" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      within(navigation).getByRole("button", { name: "Workflows" }).getAttribute("aria-current"),
    ).toBe(null);
  });

  it("gives every navigation destination a 44px mobile touch target while retaining compact desktop sizing", () => {
    renderSidebar({ selectedApplication: application });

    const navigation = screen.getByRole("navigation", { name: "Navegación principal" });
    const destinations = within(navigation).getAllByRole("button");

    expect(destinations.length).toBeGreaterThan(0);
    for (const destination of destinations) {
      expect(destination.className).toContain("min-h-11");
      expect(destination.className).toContain("md:min-h-0");
      expect(destination.className).toContain("duration-150");
      expect(destination.className).toContain("motion-reduce:duration-0");
    }
  });

  it("disables the moving hover highlight when reduced motion is requested", () => {
    mockUseReducedMotion.mockReturnValue(true);
    renderSidebar({ selectedApplication: application });

    const summaryButton = screen.getByRole("button", { name: "Resumen" });
    fireEvent.mouseEnter(summaryButton);

    expect(summaryButton.getAttribute("data-highlight")).not.toBe("true");
  });

  it("gives the privacy notice link a 44px mobile touch target", () => {
    renderSidebar();

    expect(screen.getByRole("link", { name: "Aviso de privacidad de Ayni" }).className).toContain(
      "min-h-11",
    );
    expect(screen.getByRole("link", { name: "Aviso de privacidad de Ayni" }).className).toContain(
      "motion-reduce:duration-0",
    );
  });
});
