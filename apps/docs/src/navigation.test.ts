import { describe, expect, it } from "vitest";
import { breadcrumbTrail, sidebar, sidebarGroups } from "./navigation";

describe("sidebar", () => {
  it("lists the five groups of the research in order", () => {
    expect(sidebar.map((group) => group.label)).toEqual([
      "Comenzar",
      "Guías",
      "Conceptos",
      "Referencia",
      "Recursos",
    ]);
  });

  it("autogenerates each group from its own content directory", () => {
    expect(sidebar.map((group) => group.items)).toEqual(
      sidebarGroups.map(({ directory }) => [{ autogenerate: { directory } }]),
    );
  });
});

describe("breadcrumbTrail", () => {
  const link = (label: string, href: string, isCurrent = false) => ({
    type: "link" as const,
    label,
    href,
    isCurrent,
  });
  const group = (label: string, entries: Parameters<typeof breadcrumbTrail>[0]) => ({
    type: "group" as const,
    label,
    entries,
  });

  it("names the group and the current page", () => {
    const entries = [
      group("Comenzar", [
        link("¿Qué es Ayni?", "/comenzar/que-es-ayni/"),
        link("Inicio rápido", "/comenzar/inicio-rapido/", true),
      ]),
      group("Guías", [link("Solucionar problemas", "/guias/solucionar-problemas/")]),
    ];

    expect(breadcrumbTrail(entries)).toEqual([
      { label: "Comenzar" },
      { label: "Inicio rápido", href: "/comenzar/inicio-rapido/" },
    ]);
  });

  it("follows nested groups down to the current page", () => {
    const entries = [
      group("Referencia", [group("API", [link("Estados", "/referencia/api/estados/", true)])]),
    ];

    expect(breadcrumbTrail(entries)).toEqual([
      { label: "Referencia" },
      { label: "API" },
      { label: "Estados", href: "/referencia/api/estados/" },
    ]);
  });

  it("is empty when no sidebar entry is the current page", () => {
    const entries = [group("Comenzar", [link("Inicio rápido", "/comenzar/inicio-rapido/")])];

    expect(breadcrumbTrail(entries)).toEqual([]);
  });
});
