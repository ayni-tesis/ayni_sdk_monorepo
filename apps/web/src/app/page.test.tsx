// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@ayni/env/web", () => ({
  env: {
    NEXT_PUBLIC_SERVER_URL: "http://localhost:3000",
    NEXT_PUBLIC_DOCS_URL: "https://docs.ayni.test",
  },
}));
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

  it("links to the documentation from the main navigation in a new tab", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const Home = (await import("./page")).default;
    render(<Home />);

    const navigation = screen.getByRole("navigation", { name: "Main navigation" });
    const link = within(navigation).getByRole("link", {
      name: "Documentación (se abre en una pestaña nueva)",
    });
    expect(link.getAttribute("href")).toBe("https://docs.ayni.test/");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("finds the documentation from the search dialog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const Home = (await import("./page")).default;
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /search ayni/i }));
    const dialog = screen.getByRole("dialog", { name: "Search Ayni" });
    fireEvent.change(within(dialog).getByLabelText("Find a page"), {
      target: { value: "documentación" },
    });

    const results = within(dialog).getAllByRole("link");
    expect(results).toHaveLength(1);
    expect(results[0]?.getAttribute("href")).toBe("https://docs.ayni.test/");
    expect(results[0]?.getAttribute("target")).toBe("_blank");
    expect(results[0]?.textContent).toMatch(/Documentación.*\(se abre en una pestaña nueva\)/);

    fireEvent.click(results[0] as HTMLElement);
    expect((dialog as HTMLDialogElement).open).toBe(false);
  });
});
