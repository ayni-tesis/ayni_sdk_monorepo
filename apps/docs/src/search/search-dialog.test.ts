// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PagefindResultData } from "./search";
import { type Pagefind, setupSearch } from "./search-dialog";

const estados: PagefindResultData = {
  url: "/referencia/estados-y-errores/",
  meta: { title: "Estados y errores" },
  excerpt: "",
  sub_results: [
    {
      title: "Estado general",
      url: "/referencia/estados-y-errores/#estado-general",
      excerpt: "<mark>upToDate</mark>. No había nada nuevo.",
      locations: [30],
    },
    {
      title: "Estados de cada recurso",
      url: "/referencia/estados-y-errores/#estados-de-cada-recurso",
      excerpt: "<mark>upToDate</mark>. — —",
      locations: [80],
    },
  ],
};

/** Finds the pages whose text contains the term, as Pagefind would. */
function fakePagefind(pages: PagefindResultData[]): Pagefind {
  return {
    filters: async () => ({}),
    destroy: async () => {},
    debouncedSearch: async (term) => ({
      results: pages
        .filter((page) => JSON.stringify(page).toLowerCase().includes(term.toLowerCase()))
        .map((page) => ({ data: async () => page })),
    }),
  };
}

beforeAll(() => {
  // jsdom implements <dialog> without showModal() and close().
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

let teardown: () => void;
const navigate = vi.fn<(url: string) => void>();

function mount(loadPagefind: () => Promise<Pagefind> = async () => fakePagefind([estados])) {
  document.body.innerHTML = `
    <input id="elsewhere" />
    <button type="button" data-search-open>Buscar</button>
    <dialog data-search-dialog>
      <input data-search-input />
      <button type="button" data-search-close>Cerrar</button>
      <p data-search-status></p>
      <div data-search-results></div>
    </dialog>
  `;
  teardown = setupSearch(document, { loadPagefind, navigate });
}

const dialog = () => document.querySelector("dialog") as HTMLDialogElement;
const input = () => document.querySelector("[data-search-input]") as HTMLInputElement;
const status = () => document.querySelector("[data-search-status]")?.textContent;
const options = () => [...document.querySelectorAll<HTMLAnchorElement>('[role="option"]')];

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
}

function type(term: string) {
  input().value = term;
  input().dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => navigate.mockReset());
afterEach(() => teardown());

describe("opening the search", () => {
  it("opens with Ctrl+K, focuses the field and asks for a term", () => {
    mount();

    press("k", { ctrlKey: true });

    expect(dialog().open).toBe(true);
    expect(document.activeElement).toBe(input());
    expect(status()).toBe("Escribe para buscar.");
  });

  it("opens with Cmd+K and with /", () => {
    mount();

    press("k", { metaKey: true });
    expect(dialog().open).toBe(true);
    dialog().close();

    press("/");
    expect(dialog().open).toBe(true);
  });

  it("lets / be typed in other fields", () => {
    mount();

    press("/", {}, document.querySelector("#elsewhere") as HTMLInputElement);

    expect(dialog().open).toBe(false);
  });

  it("opens from the header field", () => {
    mount();

    (document.querySelector("[data-search-open]") as HTMLButtonElement).click();

    expect(dialog().open).toBe(true);
  });
});

describe("searching", () => {
  it("shows the section and the highlighted term of each result", async () => {
    mount();
    press("k", { ctrlKey: true });

    type("upToDate");

    await vi.waitFor(() => expect(options()).toHaveLength(2));
    const [first] = options();
    expect(first?.textContent).toContain("Estados y errores");
    expect(first?.textContent).toContain("Referencia › Estado general");
    expect(first?.querySelector("mark")?.textContent).toBe("upToDate");
    expect(first?.getAttribute("aria-selected")).toBe("true");
    expect(status()).toBe("2 resultados");
  });

  it("reports the search in progress", async () => {
    let finish: (value: null) => void = () => {};
    const pending: Pagefind = {
      ...fakePagefind([]),
      debouncedSearch: () => new Promise((resolve) => (finish = resolve)),
    };
    mount(async () => pending);
    press("k", { ctrlKey: true });

    type("upToDate");

    expect(status()).toBe("Buscando…");
    finish(null);
  });

  it("keeps the previous results while the next search runs", async () => {
    const found = fakePagefind([estados]);
    let calls = 0;
    mount(async () => ({
      ...found,
      debouncedSearch: (term) =>
        ++calls === 1 ? found.debouncedSearch(term) : new Promise(() => {}),
    }));
    press("k", { ctrlKey: true });
    type("upToDat");
    await vi.waitFor(() => expect(options()).toHaveLength(2));

    type("upToDate");

    expect(status()).toBe("Buscando…");
    expect(options()).toHaveLength(2);
  });

  it("names the term that found nothing", async () => {
    mount();
    press("k", { ctrlKey: true });

    type("zzzyx");

    await vi.waitFor(() =>
      expect(status()).toBe(
        "No hay resultados para «zzzyx». Prueba con otra palabra o revisa la referencia de la API.",
      ),
    );
    expect(options()).toEqual([]);
  });

  it("goes back to the prompt when the field is cleared", async () => {
    mount();
    press("k", { ctrlKey: true });
    type("upToDate");
    await vi.waitFor(() => expect(options()).toHaveLength(2));

    type("  ");

    expect(status()).toBe("Escribe para buscar.");
    expect(options()).toEqual([]);
  });
});

describe("keyboard navigation", () => {
  it("moves with the arrows and opens the selected section with Enter", async () => {
    mount();
    press("k", { ctrlKey: true });
    type("upToDate");
    await vi.waitFor(() => expect(options()).toHaveLength(2));

    press("ArrowDown", {}, input());
    expect(input().getAttribute("aria-activedescendant")).toBe(options()[1]?.id);
    press("ArrowUp", {}, input());
    press("Enter", {}, input());

    expect(navigate).toHaveBeenCalledWith("/referencia/estados-y-errores/#estado-general");
    expect(dialog().open).toBe(false);
  });

  it("leaves the focus to the opened page instead of the trigger", async () => {
    mount();
    const trigger = document.querySelector("[data-search-open]") as HTMLButtonElement;
    trigger.focus();
    trigger.click();
    type("upToDate");
    await vi.waitFor(() => expect(options()).toHaveLength(2));

    press("Enter", {}, input());

    expect(document.activeElement).not.toBe(trigger);
  });

  it("ignores the Enter that confirms an input method composition", async () => {
    mount();
    press("k", { ctrlKey: true });
    type("upToDate");
    await vi.waitFor(() => expect(options()).toHaveLength(2));

    press("Enter", { isComposing: true }, input());

    expect(navigate).not.toHaveBeenCalled();
    expect(dialog().open).toBe(true);
  });

  it("stays open when a result is opened in a new tab", async () => {
    mount();
    press("k", { ctrlKey: true });
    type("upToDate");
    await vi.waitFor(() => expect(options()).toHaveLength(2));
    const first = options()[0] as HTMLAnchorElement;
    first.addEventListener("click", (event) => event.preventDefault());

    first.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }),
    );

    expect(dialog().open).toBe(true);
  });

  it("returns the focus to where it was when the dialog closes", () => {
    mount();
    const trigger = document.querySelector("[data-search-open]") as HTMLButtonElement;
    trigger.focus();
    trigger.click();

    dialog().close();

    expect(document.activeElement).toBe(trigger);
  });

  it("closes with Esc even while the field has text", () => {
    mount();
    press("k", { ctrlKey: true });
    type("upToDate");

    press("Escape", {}, input());

    expect(dialog().open).toBe(false);
  });

  it("closes with the close button", () => {
    mount();
    press("k", { ctrlKey: true });

    (document.querySelector("[data-search-close]") as HTMLButtonElement).click();

    expect(dialog().open).toBe(false);
  });
});

describe("when the index cannot load", () => {
  it("says so as soon as the dialog opens", async () => {
    mount(() => Promise.reject(new Error("404 pagefind.js")));

    press("k", { ctrlKey: true });

    await vi.waitFor(() =>
      expect(status()).toBe(
        "No pudimos cargar la búsqueda. Usa la barra lateral o vuelve a intentarlo.",
      ),
    );
  });

  it("tries again on the next search", async () => {
    const loadPagefind = vi
      .fn<() => Promise<Pagefind>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(fakePagefind([estados]));
    mount(loadPagefind);
    press("k", { ctrlKey: true });
    await vi.waitFor(() => expect(status()).toContain("No pudimos cargar la búsqueda."));

    type("upToDate");

    await vi.waitFor(() => expect(options()).toHaveLength(2));
  });

  it("discards Pagefind's failed instance so the retry loads the index again", async () => {
    // Pagefind keeps the error of a failed load until destroy() drops the instance.
    let failed = true;
    const pagefind: Pagefind = {
      ...fakePagefind([estados]),
      filters: async () => {
        if (failed) throw new Error("pagefind-entry.json: 404");
        return {};
      },
      destroy: vi.fn(async () => {
        failed = false;
      }),
    };
    mount(async () => pagefind);
    press("k", { ctrlKey: true });
    await vi.waitFor(() => expect(status()).toContain("No pudimos cargar la búsqueda."));

    type("upToDate");

    await vi.waitFor(() => expect(options()).toHaveLength(2));
    expect(pagefind.destroy).toHaveBeenCalledOnce();
  });

  it("runs the pending search again when the dialog reopens", async () => {
    let failed = true;
    const pagefind: Pagefind = {
      ...fakePagefind([estados]),
      filters: async () => {
        if (failed) throw new Error("offline");
        return {};
      },
    };
    mount(async () => pagefind);
    press("k", { ctrlKey: true });
    type("upToDate");
    await vi.waitFor(() => expect(status()).toContain("No pudimos cargar la búsqueda."));
    dialog().close();
    failed = false;

    press("k", { ctrlKey: true });

    await vi.waitFor(() => expect(options()).toHaveLength(2));
  });
});
