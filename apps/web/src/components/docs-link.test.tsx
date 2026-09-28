// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocsLink, docsUrl } from "./docs-link";

const env = vi.hoisted(() => ({ NEXT_PUBLIC_DOCS_URL: "https://docs.ayni.test" }));
vi.mock("@ayni/env/web", () => ({ env }));

afterEach(() => {
  cleanup();
  env.NEXT_PUBLIC_DOCS_URL = "https://docs.ayni.test";
});

describe("docsUrl", () => {
  it("joins the configured documentation URL with the page's path and anchor", () => {
    expect(docsUrl("home")).toBe("https://docs.ayni.test/");
    expect(docsUrl("quickstartCredential")).toBe(
      "https://docs.ayni.test/comenzar/inicio-rapido/#2-guarda-la-credencial",
    );
  });

  it("keeps the path of a documentation URL served under a folder", () => {
    for (const base of ["https://ayni.test/docs", "https://ayni.test/docs/"]) {
      env.NEXT_PUBLIC_DOCS_URL = base;

      expect(docsUrl("home")).toBe("https://ayni.test/docs/");
      expect(docsUrl("workflowSchema")).toBe(
        "https://ayni.test/docs/referencia/esquema-de-workflow/",
      );
    }
  });
});

describe("DocsLink", () => {
  it("opens the page in a new tab and says so to assistive technology", () => {
    render(<DocsLink page="workflowSchema">Ver el esquema de workflow</DocsLink>);

    const link = screen.getByRole("link", {
      name: "Ver el esquema de workflow (se abre en una pestaña nueva)",
    });
    expect(link.getAttribute("href")).toBe(
      "https://docs.ayni.test/referencia/esquema-de-workflow/",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
