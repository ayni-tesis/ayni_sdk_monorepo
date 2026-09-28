/** A link to another site, with the `<page>:<line>` that writes it. */
export type ExternalLink = { url: string; location: string };

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** How long a site has to answer before its link counts as unreachable. */
const timeoutMs = 15_000;

/**
 * The `http` and `https` links the `pages` (keyed by their path) write as
 * Markdown links or `href` attributes, outside code blocks.
 */
export function externalLinks(pages: Record<string, string>): ExternalLink[] {
  return Object.entries(pages).flatMap(([page, source]) => {
    let inCode = false;
    return source.split(/\r?\n/).flatMap((line, index) => {
      if (/^\s*(`{3,}|~{3,})/.test(line)) inCode = !inCode;
      if (inCode || /^\s*(`{3,}|~{3,})/.test(line)) return [];
      return [
        ...line.matchAll(/\]\(\s*<?(https?:\/\/[^)\s>]+)|\shref=["'](https?:\/\/[^"']+)/g),
      ].map(([, markdown, attribute]) => ({
        url: markdown ?? attribute ?? "",
        location: `${page}:${index + 1}`,
      }));
    });
  });
}

/**
 * A warning for each link of `links` whose site does not answer with a
 * success, with every page and line that writes it. Third-party sites fail
 * for reasons the documentation does not control, so these warnings never
 * block a change (US-150). Sites that reject `HEAD` are asked with `GET`.
 */
export async function unreachableLinks(
  links: ExternalLink[],
  fetcher: Fetcher = fetch,
): Promise<string[]> {
  const locations = new Map<string, string[]>();
  for (const { url, location } of links) {
    locations.set(url, [...(locations.get(url) ?? []), location]);
  }
  const problems = await Promise.all(
    [...locations.keys()].map(async (url) => [url, await linkProblem(url, fetcher)] as const),
  );
  return problems.flatMap(([url, problem]) =>
    problem
      ? [
          `Enlace externo no disponible: ${url} en ${(locations.get(url) ?? []).join(", ")} (${problem})`,
        ]
      : [],
  );
}

async function linkProblem(url: string, fetcher: Fetcher): Promise<string | undefined> {
  try {
    let response = await fetcher(url, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      response = await fetcher(url, { method: "GET", signal: AbortSignal.timeout(timeoutMs) });
    }
    return response.ok ? undefined : `HTTP ${response.status}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
