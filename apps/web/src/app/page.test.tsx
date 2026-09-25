// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@ayni/env/web", () => ({ env: { NEXT_PUBLIC_SERVER_URL: "http://localhost:3000" } }));
vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});
vi.mock("./page.module.css", () => ({
  default: new Proxy({}, { get: (_target, name) => String(name) }),
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("home landing page", () => {
  it("introduces Ayni, links developers to registration and dashboard, and reports API health", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const Home = (await import("./page")).default;
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: /workflows that keep working offline/i }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /create your workspace/i }).getAttribute("href")).toBe(
      "/register",
    );
    expect(screen.getByRole("link", { name: /go to dashboard/i }).getAttribute("href")).toBe(
      "/dashboard",
    );
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/connected/i));
  });

  it("gives the search dialog an accessible name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const Home = (await import("./page")).default;
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /search ayni/i }));
    expect(screen.getByRole("dialog", { name: "Search Ayni" })).toBeTruthy();
  });
});
