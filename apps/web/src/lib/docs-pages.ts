/**
 * The pages of the SDK documentation site (`apps/docs`) that the landing and
 * the dashboard link to, as paths of that site (US-149). The site's base URL
 * comes from `NEXT_PUBLIC_DOCS_URL`. `astro build` in `apps/docs` fails when
 * one of these pages or anchors no longer exists, so keep this file free of
 * imports: the docs site reads it too.
 */
export const docsPages = {
  home: "/",
  quickstartCredential: "/comenzar/inicio-rapido/#2-guarda-la-credencial",
  workflowSchema: "/referencia/esquema-de-workflow/",
  prepareApplication: "/guias/preparar-una-aplicacion-en-el-dashboard/",
} as const;

export type DocsPage = keyof typeof docsPages;
