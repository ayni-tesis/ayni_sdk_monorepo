import { sidebarGroups } from "../navigation";

/** Visible text of the search dialog (US-138). */
export const searchText = {
  label: "Buscar",
  placeholder: "Buscar en la documentación",
  help: "Escribe una clase, un concepto o un código de error.",
  hints: "↑↓ para moverte · Enter para abrir · Esc para cerrar",
  results: "Resultados de la búsqueda",
  close: "Cerrar",
};

export type SearchHit = { title: string; section: string; excerpt: string; url: string };

export type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; hits: SearchHit[] }
  | { kind: "empty"; term: string }
  | { kind: "error" };

export function statusMessage(state: SearchState): string {
  switch (state.kind) {
    case "idle":
      return "Escribe para buscar.";
    case "loading":
      return "Buscando…";
    case "empty":
      return `No hay resultados para «${state.term}». Prueba con otra palabra o revisa la referencia de la API.`;
    case "error":
      return "No pudimos cargar la búsqueda. Usa la barra lateral o vuelve a intentarlo.";
    case "results":
      return state.hits.length === 1 ? "1 resultado" : `${state.hits.length} resultados`;
  }
}

/** The result selected after pressing ↑ (-1) or ↓ (1), wrapping at both ends. */
export function moveSelection(current: number, count: number, direction: 1 | -1): number {
  if (count === 0) return -1;
  return (current + direction + count) % count;
}

/**
 * Splits a Pagefind excerpt on its `<mark>` tags. Pagefind escapes only `<` and
 * `>` in the page text (not `&`), so the excerpt is not safe HTML: the parts are
 * unescaped here and rendered as text.
 */
export function excerptParts(excerpt: string): { text: string; highlighted: boolean }[] {
  const unescapeBrackets = (text: string) => text.replaceAll("&lt;", "<").replaceAll("&gt;", ">");
  return excerpt
    .split(/(<mark>.*?<\/mark>)/)
    .filter((part) => part.length > 0)
    .map((part) =>
      part.startsWith("<mark>") && part.endsWith("</mark>")
        ? {
            text: unescapeBrackets(part.slice("<mark>".length, -"</mark>".length)),
            highlighted: true,
          }
        : { text: unescapeBrackets(part), highlighted: false },
    );
}

/** The part of Pagefind's result data the dialog reads. */
export type PagefindResultData = {
  url: string;
  meta: { title?: string };
  excerpt: string;
  sub_results?: { title: string; url: string; excerpt: string; locations?: number[] }[];
};

const sectionsPerPage = 3;

/** Pagefind records root-relative URLs; anything else would take the reader off the site. */
const isSitePath = (url: string) => url.startsWith("/") && !url.startsWith("//");

/**
 * One hit per matching section of the page, the sections with most matches
 * first. Hits whose URL is not a path of this site are dropped.
 */
export function toHits(page: PagefindResultData): SearchHit[] {
  return pageHits(page).filter((hit) => isSitePath(hit.url));
}

function pageHits(page: PagefindResultData): SearchHit[] {
  const title = page.meta.title ?? page.url;
  const group = sidebarGroups.find(({ directory }) => page.url.startsWith(`/${directory}/`));
  const sectionOf = (heading?: string) =>
    [group?.label, heading === title ? undefined : heading].filter(Boolean).join(" › ") || "Inicio";

  const sections = [...(page.sub_results ?? [])]
    .sort((a, b) => (b.locations?.length ?? 0) - (a.locations?.length ?? 0))
    .slice(0, sectionsPerPage);
  if (sections.length === 0) {
    return [{ title, section: sectionOf(), excerpt: page.excerpt, url: page.url }];
  }
  return sections.map((section) => ({
    title,
    section: sectionOf(section.title),
    excerpt: section.excerpt,
    url: section.url,
  }));
}
