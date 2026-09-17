// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

const { client, activeOrgRef } = vi.hoisted(() => ({
  client: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  activeOrgRef: { current: { id: "org-1", name: "Laboratorio Andino" } },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useActiveOrganization: () => ({ data: activeOrgRef.current }),
    useActiveMemberRole: () => ({ data: { role: "admin" } }),
  },
}));
vi.mock("@/lib/http-client", () => ({ httpClient: client }));
vi.mock("./dashboard.css", () => ({}));

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

import Dashboard from "./dashboard";

describe("Dashboard", () => {
  it("lists workspace applications and opens their protected detail", async () => {
    client.get
      .mockResolvedValueOnce({
        data: [{ id: "app-1", organizationId: "org-1", name: "Cámara", status: "active" }],
      })
      .mockResolvedValueOnce({
        data: { id: "app-1", organizationId: "org-1", name: "Cámara", status: "active" },
      });

    render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    expect(await screen.findByRole("button", { name: /cámara/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /cámara/i }));

    await waitFor(() => expect(screen.getByText("ID de aplicación")).toBeTruthy());
    expect(client.get).toHaveBeenCalledWith("/applications/app-1");
  });

  it("ignores responses from a previous workspace after the workspace changes", async () => {
    let resolveFirstRequest: (value: { data: unknown }) => void = () => {};
    client.get.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstRequest = resolve;
      }),
    );

    const { rerender } = render(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    activeOrgRef.current = { id: "org-2", name: "Nuevo Workspace" };
    client.get.mockResolvedValueOnce({
      data: [{ id: "app-2", organizationId: "org-2", name: "App Dos", status: "active" }],
    });

    rerender(
      <TooltipProvider>
        <Dashboard userName="Diego" />
      </TooltipProvider>,
    );

    resolveFirstRequest({
      data: [{ id: "app-1", organizationId: "org-1", name: "App Uno", status: "active" }],
    });

    expect(await screen.findByRole("button", { name: /app dos/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /app uno/i })).toBeNull();
  });
});
