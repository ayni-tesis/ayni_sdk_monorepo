import { createOpenAPISidebarGroup } from "starlight-openapi";
import { sidebarGroups } from "./sidebar-groups";

export { sidebarGroups };

/**
 * Where `starlight-openapi` puts the pages it generates from the OpenAPI
 * document (US-144): its route middleware swaps this placeholder for them.
 */
export const httpReferenceSidebarGroup = createOpenAPISidebarGroup();

/**
 * Pages that are not in a content directory, by group label. The Dart
 * reference is `dart doc` output served from `public/` (US-143), so it is
 * linked by hand to the index of the `ayni_sdk` library.
 */
const extraLinks: Partial<
  Record<
    (typeof sidebarGroups)[number]["label"],
    ({ label: string; link: string } | typeof httpReferenceSidebarGroup)[]
  >
> = {
  Referencia: [
    { label: "API del SDK (Dart)", link: "/referencia/api-dart/ayni_sdk/" },
    httpReferenceSidebarGroup,
  ],
};

export const sidebar = sidebarGroups.map(({ label, directory }) => ({
  label,
  items: [{ autogenerate: { directory } }, ...(extraLinks[label] ?? [])],
}));

/** The part of Starlight's sidebar route data the breadcrumbs read. */
type SidebarEntry =
  | { type: "link"; label: string; href: string; isCurrent: boolean }
  | { type: "group"; label: string; entries: SidebarEntry[] };

export type Breadcrumb = { label: string; href?: string };

/** The groups that lead to the current page, followed by the page itself. */
export function breadcrumbTrail(entries: SidebarEntry[]): Breadcrumb[] {
  for (const entry of entries) {
    if (entry.type === "link") {
      if (entry.isCurrent) return [{ label: entry.label, href: entry.href }];
      continue;
    }
    const trail = breadcrumbTrail(entry.entries);
    if (trail.length > 0) return [{ label: entry.label }, ...trail];
  }
  return [];
}
