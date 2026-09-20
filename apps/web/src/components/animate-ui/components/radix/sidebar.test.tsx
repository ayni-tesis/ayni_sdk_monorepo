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

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
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
