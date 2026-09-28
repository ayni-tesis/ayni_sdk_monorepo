import { describe, expect, it } from "vitest";
import { externalLinks, unreachableLinks } from "./external-links";

describe("externalLinks", () => {
  it("lists the http links pages write, with their page and line, outside code blocks", () => {
    const pages = {
      "comenzar/instalacion.mdx": [
        "Instala [ayni_sdk](https://pub.dev/packages/ayni_sdk) y lee la [guía](/comenzar/inicio-rapido/).",
        "",
        "```sh",
        "curl https://ejemplo.invalid/[no](https://no.invalid)",
        "```",
        '<a href="https://github.com/ayni-tesis/ayni_sdk_monorepo/issues/new">Abre un issue</a>',
      ].join("\n"),
    };

    expect(externalLinks(pages)).toEqual([
      { url: "https://pub.dev/packages/ayni_sdk", location: "comenzar/instalacion.mdx:1" },
      {
        url: "https://github.com/ayni-tesis/ayni_sdk_monorepo/issues/new",
        location: "comenzar/instalacion.mdx:6",
      },
    ]);
  });
});

describe("unreachableLinks", () => {
  const links = [
    { url: "https://pub.dev/packages/ayni_sdk", location: "a.md:1" },
    { url: "https://pub.dev/packages/ayni_sdk", location: "b.md:4" },
    { url: "https://example.com/borrado", location: "a.md:2" },
    { url: "https://sin-head.example.com/", location: "a.md:3" },
    { url: "https://caido.example.com/", location: "c.md:9" },
  ];

  it("warns once per unreachable link, naming every page and line that writes it", async () => {
    const requests: string[] = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      requests.push(`${init?.method} ${url}`);
      if (String(url).includes("caido")) throw new TypeError("fetch failed");
      if (String(url).includes("borrado")) return new Response(null, { status: 404 });
      if (String(url).includes("sin-head") && init?.method === "HEAD") {
        return new Response(null, { status: 405 });
      }
      return new Response(null, { status: 200 });
    };

    expect(await unreachableLinks(links, fetcher)).toEqual([
      "Enlace externo no disponible: https://example.com/borrado en a.md:2 (HTTP 404)",
      "Enlace externo no disponible: https://caido.example.com/ en c.md:9 (fetch failed)",
    ]);
    expect(requests.filter((request) => request.includes("pub.dev"))).toEqual([
      "HEAD https://pub.dev/packages/ayni_sdk",
    ]);
    expect(requests).toContain("GET https://sin-head.example.com/");
  });
});
