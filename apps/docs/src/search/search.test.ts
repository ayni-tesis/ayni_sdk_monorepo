import { describe, expect, it } from "vitest";
import {
  excerptParts,
  moveSelection,
  type PagefindResultData,
  statusMessage,
  toHits,
} from "./search";

describe("statusMessage", () => {
  it("asks for a term before the first keystroke", () => {
    expect(statusMessage({ kind: "idle" })).toBe("Escribe para buscar.");
  });

  it("reports a search in progress", () => {
    expect(statusMessage({ kind: "loading" })).toBe("Buscando…");
  });

  it("names the term that found nothing", () => {
    expect(statusMessage({ kind: "empty", term: "zzz" })).toBe(
      "No hay resultados para «zzz». Prueba con otra palabra o revisa la referencia de la API.",
    );
  });

  it("points to the sidebar when the index cannot load", () => {
    expect(statusMessage({ kind: "error" })).toBe(
      "No pudimos cargar la búsqueda. Usa la barra lateral o vuelve a intentarlo.",
    );
  });

  it("counts the results for screen readers", () => {
    const hit = { title: "Estados y errores", section: "Referencia", excerpt: "", url: "/" };

    expect(statusMessage({ kind: "results", hits: [hit] })).toBe("1 resultado");
    expect(statusMessage({ kind: "results", hits: [hit, hit] })).toBe("2 resultados");
  });
});

describe("moveSelection", () => {
  it("moves down and wraps to the first result", () => {
    expect(moveSelection(0, 3, 1)).toBe(1);
    expect(moveSelection(2, 3, 1)).toBe(0);
  });

  it("moves up and wraps to the last result", () => {
    expect(moveSelection(1, 3, -1)).toBe(0);
    expect(moveSelection(0, 3, -1)).toBe(2);
  });

  it("selects nothing when there are no results", () => {
    expect(moveSelection(0, 0, 1)).toBe(-1);
  });
});

describe("excerptParts", () => {
  it("splits the highlighted term from the surrounding text", () => {
    expect(excerptParts("No había <mark>upToDate</mark> nuevo.")).toEqual([
      { text: "No había ", highlighted: false },
      { text: "upToDate", highlighted: true },
      { text: " nuevo.", highlighted: false },
    ]);
  });

  it("restores the angle brackets Pagefind escapes in the page text", () => {
    expect(excerptParts("<mark>Future&lt;void&gt;</mark> de &lt;nombre&gt;")).toEqual([
      { text: "Future<void>", highlighted: true },
      { text: " de <nombre>", highlighted: false },
    ]);
  });
});

describe("toHits", () => {
  const page: PagefindResultData = {
    url: "/referencia/estados-y-errores/",
    meta: { title: "Estados y errores" },
    excerpt: "<mark>upToDate</mark> en la página",
    sub_results: [
      {
        title: "Estados y errores",
        url: "/referencia/estados-y-errores/#_top",
        excerpt: "Estados y errores. sync()",
        locations: [1],
      },
      {
        title: "Estado general",
        url: "/referencia/estados-y-errores/#estado-general",
        excerpt: "<mark>upToDate</mark>. No había nada nuevo",
        locations: [30, 31],
      },
    ],
  };

  it("returns one hit per matching section, the most relevant first", () => {
    expect(toHits(page)).toEqual([
      {
        title: "Estados y errores",
        section: "Referencia › Estado general",
        excerpt: "<mark>upToDate</mark>. No había nada nuevo",
        url: "/referencia/estados-y-errores/#estado-general",
      },
      {
        title: "Estados y errores",
        section: "Referencia",
        excerpt: "Estados y errores. sync()",
        url: "/referencia/estados-y-errores/#_top",
      },
    ]);
  });

  it("keeps at most three sections per page", () => {
    const section = (id: number) => ({
      title: `Sección ${id}`,
      url: `/guias/pagina/#s${id}`,
      excerpt: "",
      locations: [id],
    });
    const hits = toHits({
      url: "/guias/pagina/",
      meta: { title: "Página" },
      excerpt: "",
      sub_results: [1, 2, 3, 4].map(section),
    });

    expect(hits.map((hit) => hit.url)).toEqual([
      "/guias/pagina/#s1",
      "/guias/pagina/#s2",
      "/guias/pagina/#s3",
    ]);
  });

  it("falls back to the page itself when it has no sections", () => {
    expect(toHits({ url: "/", meta: { title: "Documentación de Ayni" }, excerpt: "Ayni" })).toEqual(
      [{ title: "Documentación de Ayni", section: "Inicio", excerpt: "Ayni", url: "/" }],
    );
  });
});
