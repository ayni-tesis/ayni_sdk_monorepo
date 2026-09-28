/**
 * Adapts one `dart doc` page of the SDK reference (US-143) to the site:
 * Spanish `lang` on the page (so Pagefind adds it to the site's only index)
 * but English on its main content, the language of the `///` comments; the
 * main content marked for search unless `searchable` is false; a header that
 * links back to the site and names the documented version; and an `Obsoleto`
 * badge on deprecated symbols, which `dart doc` only strikes through. HTML
 * fragments without those parts, such as the sidebars, come back unchanged.
 */
export function prepareReferencePage(
  html: string,
  {
    packageName,
    version,
    searchable = true,
  }: { packageName: string; version: string; searchable?: boolean },
): string {
  let page = html.replace('<html lang="en">', '<html lang="es">');
  page = page.replace(
    'id="dartdoc-main-content"',
    `id="dartdoc-main-content" lang="en"${searchable ? " data-pagefind-body" : ""}`,
  );
  page = page.replace(
    new RegExp(
      `(<ol class="breadcrumbs gt-separated dark hidden-xs">\\s*)(<li[^>]*>)(<a [^>]*>)?${packageName}(?: package)?(</a>)?</li>`,
    ),
    `$1<li><a href="/">Ayni Docs</a></li>$2$3${packageName} ${version}$4</li>`,
  );
  page = page.replace(
    /(<dt\b[^>]*>(?:(?!<\/dt>)[\s\S])*?class="name deprecated"(?:(?!<\/dt>)[\s\S])*?)(\s*<\/dt>)/g,
    `$1${deprecatedBadge}$2`,
  );
  if (/<li class="self-crumb"><span class="deprecated">/.test(page)) {
    page = page.replace(/(<h1>[\s\S]*?)(<\/h1>)/, `$1${deprecatedBadge}$2`);
  }
  return page;
}

const deprecatedBadge = '<span class="feature">Obsoleto</span>';

/** The `version` of a `pubspec.yaml`. */
export function sdkVersion(pubspec: string): string {
  const version = /^version:\s*(\S+)\s*$/m.exec(pubspec)?.[1];
  if (!version) throw new Error("The pubspec has no version.");
  return version;
}
