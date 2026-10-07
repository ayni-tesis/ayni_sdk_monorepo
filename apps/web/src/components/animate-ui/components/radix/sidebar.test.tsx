// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "./sidebar";

const { mockUseReducedMotion } = vi.hoisted(() => ({
  mockUseReducedMotion: vi.fn(() => false),
}));

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: mockUseReducedMotion,
}));

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.innerWidth = 1024;
  mockUseReducedMotion.mockReturnValue(false);
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
});

afterEach(() => {
  cleanup();
  mockUseReducedMotion.mockReturnValue(false);
  window.innerWidth = 1024;
});

function TestConsumer() {
  const { state, open, toggleSidebar } = useSidebar();
  return (
    <div>
      <span data-testid="sidebar-state">{state}</span>
      <span data-testid="sidebar-open">{open ? "open" : "closed"}</span>
      <button data-testid="custom-toggle" type="button" onClick={toggleSidebar}>
        Toggle
      </button>
    </div>
  );
}

describe("Animate UI Sidebar", () => {
  it("renders SidebarProvider with children and context values", () => {
    render(
      <SidebarProvider defaultOpen={true}>
        <TestConsumer />
      </SidebarProvider>,
    );

    expect(screen.getByTestId("sidebar-state").textContent).toBe("expanded");
    expect(screen.getByTestId("sidebar-open").textContent).toBe("open");
  });

  it("toggles state when toggleSidebar is invoked", () => {
    render(
      <SidebarProvider defaultOpen={true}>
        <TestConsumer />
      </SidebarProvider>,
    );

    expect(screen.getByTestId("sidebar-state").textContent).toBe("expanded");
    fireEvent.click(screen.getByTestId("custom-toggle"));
    expect(screen.getByTestId("sidebar-state").textContent).toBe("collapsed");
  });

  it("names the desktop controls for the action they perform", () => {
    render(
      <SidebarProvider defaultOpen>
        <Sidebar collapsible="icon">
          <SidebarRail />
        </Sidebar>
        <SidebarTrigger />
      </SidebarProvider>,
    );

    const trigger = screen.getByTestId("sidebar-trigger");
    const rail = screen.getByTestId("sidebar-rail");

    expect(trigger.textContent).toBe("Contraer la barra lateral");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(rail.getAttribute("aria-label")).toBe("Contraer la barra lateral");

    fireEvent.click(trigger);

    expect(trigger.textContent).toBe("Expandir la barra lateral");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(rail.getAttribute("aria-label")).toBe("Expandir la barra lateral");
  });

  it("describes the mobile navigation drawer and its current action in Spanish", () => {
    window.innerWidth = 390;

    render(
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Espacio de trabajo</SidebarGroupLabel>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <SidebarTrigger />
      </SidebarProvider>,
    );

    const trigger = screen.getByTestId("sidebar-trigger");
    expect(trigger.textContent).toBe("Abrir el menú de navegación");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.className).toContain("size-11");
    expect(trigger.className).toContain("md:size-7");

    fireEvent.click(trigger);

    expect(trigger.textContent).toBe("Cerrar el menú de navegación");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const dialog = screen.getByRole("dialog", { name: "Menú de navegación" });
    expect(dialog.className).toContain("motion-reduce:animate-none");
    expect(screen.getByText("Elige una sección del panel para continuar.")).toBeTruthy();

    const closeButton = screen.getByRole("button", { name: "Cerrar el menú de navegación" });
    expect(closeButton.className).toContain("size-11");
    fireEvent.click(closeButton);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger.textContent).toBe("Abrir el menú de navegación");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("uses decelerating sidebar transitions that stop moving when reduced motion is requested", () => {
    const { container } = render(
      <SidebarProvider>
        <Sidebar collapsible="icon" />
      </SidebarProvider>,
    );

    const gap = container.querySelector('[data-slot="sidebar-gap"]');
    const sidebarContainer = container.querySelector('[data-slot="sidebar-container"]');

    expect(gap?.className).toContain("duration-[220ms]");
    expect(gap?.className).toContain("ease-[cubic-bezier(0.16,1,0.3,1)]");
    expect(gap?.className).toContain("motion-reduce:duration-0");
    expect(gap?.className).not.toContain("cubic-bezier(0.7,-0.15,0.25,1.15)");
    expect(sidebarContainer?.className).toContain("motion-reduce:duration-0");

    mockUseReducedMotion.mockReturnValue(true);
    render(
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Aplicaciones">Aplicaciones</SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </Sidebar>
      </SidebarProvider>,
    );

    const navigationItem = screen.getByRole("button", { name: "Aplicaciones" });
    fireEvent.mouseEnter(navigationItem);
    expect(navigationItem.getAttribute("data-highlight")).not.toBe("true");
  });

  it("transitions sidebar menu feedback without motion when requested", () => {
    render(
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Aplicaciones">Aplicaciones</SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </Sidebar>
      </SidebarProvider>,
    );

    const navigationItem = screen.getByRole("button", { name: "Aplicaciones" });
    expect(navigationItem.className).toContain(
      "transition-[width,height,padding,border-color,background-color,color]",
    );
    expect(navigationItem.className).toContain("duration-150");
    expect(navigationItem.className).toContain("motion-reduce:duration-0");
  });

  it("toggles sidebar via keyboard shortcut (Ctrl+B / Meta+B)", () => {
    render(
      <SidebarProvider defaultOpen={true}>
        <TestConsumer />
      </SidebarProvider>,
    );

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(screen.getByTestId("sidebar-state").textContent).toBe("collapsed");

    fireEvent.keyDown(window, { key: "b", metaKey: true });
    expect(screen.getByTestId("sidebar-state").textContent).toBe("expanded");
  });

  it("renders complete sidebar layout with menu items and trigger", () => {
    render(
      <SidebarProvider defaultOpen={true}>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <span>Logo</span>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive tooltip="Aplicaciones">
                      <span>Aplicaciones</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <span>Footer</span>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <SidebarTrigger />
          <div>Main Content</div>
        </SidebarInset>
      </SidebarProvider>,
    );

    expect(screen.getByText("Logo")).toBeTruthy();
    expect(screen.getByText("Menu")).toBeTruthy();
    expect(screen.getByText("Aplicaciones")).toBeTruthy();
    expect(screen.getByText("Footer")).toBeTruthy();
    expect(screen.getByText("Main Content")).toBeTruthy();

    const trigger = screen.getByTestId("sidebar-trigger");
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger);

    const rail = screen.getByTestId("sidebar-rail");
    expect(rail).toBeTruthy();
    fireEvent.click(rail);
  });
});
