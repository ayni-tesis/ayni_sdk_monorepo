import {
  excerptParts,
  moveSelection,
  type PagefindResultData,
  type SearchHit,
  type SearchState,
  statusMessage,
  toHits,
} from "./search";

/** The part of Pagefind's JavaScript API (`/pagefind/pagefind.js`) the dialog uses. */
export type Pagefind = {
  debouncedSearch(
    term: string,
    options?: object,
    debounceTimeoutMs?: number,
  ): Promise<{ results: { data(): Promise<PagefindResultData> }[] } | null>;
  filters(): Promise<unknown>;
  destroy(): Promise<void>;
};

export type SearchOptions = {
  loadPagefind: () => Promise<Pagefind>;
  navigate: (url: string) => void;
};

const pagesShown = 8;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Wires the search dialog rendered by `components/Search.astro`: Ctrl/Cmd + K
 * and `/` open it, ↑↓ move through the results, Enter opens one and closing it
 * returns the focus to where it was. Returns a function that removes the
 * global shortcut listener.
 */
export function setupSearch(root: ParentNode, { loadPagefind, navigate }: SearchOptions) {
  const query = <T extends Element>(selector: string) => root.querySelector<T>(selector) as T;
  const trigger = query<HTMLButtonElement>("[data-search-open]");
  const dialog = query<HTMLDialogElement>("[data-search-dialog]");
  const input = query<HTMLInputElement>("[data-search-input]");
  const closeButton = query<HTMLButtonElement>("[data-search-close]");
  const status = query<HTMLElement>("[data-search-status]");
  const results = query<HTMLElement>("[data-search-results]");

  let pagefind: Promise<Pagefind> | undefined;
  let hits: SearchHit[] = [];
  let selected = -1;
  let latestSearch = 0;
  let returnFocus: HTMLElement | null = null;

  /**
   * Loads the index once; a failed load is retried on the next attempt.
   * `filters()` waits for the index, so a missing index fails here, on open.
   */
  function getPagefind(): Promise<Pagefind> {
    pagefind ??= loadPagefind()
      .then(async (instance) => {
        try {
          await instance.filters();
        } catch (error) {
          // Pagefind keeps a failed load's error until its instance is destroyed.
          await instance.destroy().catch(() => {});
          throw error;
        }
        return instance;
      })
      .catch((error: unknown) => {
        pagefind = undefined;
        throw error;
      });
    return pagefind;
  }

  function select(index: number) {
    selected = index;
    const options = results.querySelectorAll('[role="option"]');
    options.forEach((option, i) => {
      option.setAttribute("aria-selected", String(i === index));
    });
    const current = options[index];
    if (current) {
      input.setAttribute("aria-activedescendant", current.id);
      current.scrollIntoView?.({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function render(state: SearchState) {
    status.textContent = statusMessage(state);
    // The previous results stay until the new ones arrive, so the list does not flicker.
    if (state.kind === "loading") return;
    hits = state.kind === "results" ? state.hits : [];
    results.replaceChildren(
      ...hits.map((hit, index) => {
        const option = document.createElement("a");
        option.id = `search-result-${index}`;
        option.href = hit.url;
        option.tabIndex = -1;
        option.setAttribute("role", "option");
        const title = document.createElement("span");
        title.className = "search-result-title";
        title.textContent = hit.title;
        const section = document.createElement("span");
        section.className = "search-result-section";
        section.textContent = hit.section;
        const excerpt = document.createElement("span");
        excerpt.className = "search-result-excerpt";
        excerpt.append(
          ...excerptParts(hit.excerpt).map(({ text, highlighted }) => {
            if (!highlighted) return text;
            const mark = document.createElement("mark");
            mark.textContent = text;
            return mark;
          }),
        );
        option.append(title, section, excerpt);
        return option;
      }),
    );
    input.setAttribute("aria-expanded", String(hits.length > 0));
    select(hits.length > 0 ? 0 : -1);
  }

  async function search() {
    const term = input.value.trim();
    const id = ++latestSearch;
    if (term === "") {
      render({ kind: "idle" });
      return;
    }
    render({ kind: "loading" });
    try {
      const response = await (await getPagefind()).debouncedSearch(term);
      if (response === null || id !== latestSearch) return;
      const pages = await Promise.all(
        response.results.slice(0, pagesShown).map((result) => result.data()),
      );
      if (id !== latestSearch) return;
      const found = pages.flatMap(toHits);
      render(found.length > 0 ? { kind: "results", hits: found } : { kind: "empty", term });
    } catch {
      if (id === latestSearch) render({ kind: "error" });
    }
  }

  function open() {
    if (dialog.open) return;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    document.body.toggleAttribute("data-search-modal-open", true);
    input.focus();
    // A term left from an earlier visit is searched again, in case that search failed.
    if (input.value.trim() !== "") {
      void search();
      return;
    }
    render({ kind: "idle" });
    const id = latestSearch;
    getPagefind().catch(() => {
      if (id === latestSearch) render({ kind: "error" });
    });
  }

  function close() {
    dialog.close();
  }

  /** Closes the dialog without moving the focus, because a result is opening. */
  function closeForResult() {
    returnFocus = null;
    close();
  }

  function openSelected() {
    const hit = hits[selected];
    if (!hit) return;
    closeForResult();
    navigate(hit.url);
  }

  trigger.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  input.addEventListener("input", search);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      select(moveSelection(selected, hits.length, event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      openSelected();
    } else if (event.key === "Escape") {
      // A search field would spend the first Esc clearing its text.
      event.preventDefault();
      close();
    }
  });
  results.addEventListener("click", (event) => {
    // Ctrl, Cmd or Shift opens the result in another tab or window; keep searching here.
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target instanceof Element && event.target.closest('[role="option"]')) {
      closeForResult();
    }
  });
  // A click on the dialog itself, outside its frame, is a click on the backdrop.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener("close", () => {
    document.body.toggleAttribute("data-search-modal-open", false);
    returnFocus?.focus({ preventScroll: true });
    returnFocus = null;
  });

  const onShortcut = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      dialog.open ? close() : open();
    } else if (
      event.key === "/" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !dialog.open &&
      !isEditable(event.target)
    ) {
      event.preventDefault();
      open();
    }
  };
  window.addEventListener("keydown", onShortcut);
  return () => window.removeEventListener("keydown", onShortcut);
}
