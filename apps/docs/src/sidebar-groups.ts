/**
 * The five sidebar groups from `docs/investigacion/documentacion-sdk.md`
 * (section 4). Each group lists every page in its content directory, so a new
 * page cannot be left out of the sidebar.
 *
 * Kept free of imports: the search dialog runs in the browser and names each
 * result's group with these labels, while `navigation.ts` needs
 * `starlight-openapi`, which only works on the server.
 */
export const sidebarGroups = [
  { label: "Comenzar", directory: "comenzar" },
  { label: "Guías", directory: "guias" },
  { label: "Conceptos", directory: "conceptos" },
  { label: "Referencia", directory: "referencia" },
  { label: "Recursos", directory: "recursos" },
] as const;
