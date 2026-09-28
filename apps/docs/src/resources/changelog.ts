/**
 * The sections a version's notes may have, in the order `CHANGELOG.md` and
 * `Recursos → Notas de versión y compatibilidad` list them (US-148).
 */
export const sectionTitles = [
  "Novedades",
  "Correcciones",
  "Cambios incompatibles",
  "Cómo migrar",
] as const;

export type SectionTitle = (typeof sectionTitles)[number];

/** What the page shows while `CHANGELOG.md` has no version. */
export const noReleasesMessage =
  "Aún no hay versiones publicadas. El SDK se instala desde el repositorio.";

/** The badges a version can have: `Prerelease` when it has a SemVer pre-release identifier. */
export const stabilities = ["Prerelease", "Estable"] as const;

export type Stability = (typeof stabilities)[number];

/** A version of `ayni_sdk` as its `CHANGELOG.md` entry describes it. */
export type Release = {
  version: string;
  /** The publication date, `YYYY-MM-DD`. */
  date: string;
  stability: Stability;
  /** The Markdown between the version heading and its first section. */
  summary: string;
  /** The Markdown of each section the entry has. */
  sections: Partial<Record<SectionTitle, string>>;
};

/** What the page says for a section a version leaves out. */
const emptySections: Record<SectionTitle, string> = {
  Novedades: "Sin novedades.",
  Correcciones: "Sin correcciones.",
  "Cambios incompatibles": "Sin cambios incompatibles.",
  "Cómo migrar": "No hace falta migrar.",
};

// semver.org's regular expression, split into core, pre-release and build.
const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * The versions of `CHANGELOG.md`, from newest to oldest. Each `## <version> -
 * <YYYY-MM-DD>` heading starts a version, and its `###` headings are sections
 * from `sectionTitles`. Text before the first version is ignored. Throws on an
 * entry the page could not show as US-148 asks, so the site's build fails.
 */
export function parseChangelog(source: string): Release[] {
  const blocks = `\n${source.replace(/\r\n/g, "\n")}`.split(/\n(?=## )/).slice(1);
  const releases = blocks.map(parseRelease);
  for (const [index, release] of releases.entries()) {
    const newer = releases[index - 1];
    if (newer && compareVersions(newer.version, release.version) <= 0) {
      throw new Error(
        `The changelog must list versions from newest to oldest: ${release.version} comes after ${newer.version}.`,
      );
    }
  }
  return releases;
}

function parseRelease(block: string): Release {
  const [heading = "", ...lines] = block.split("\n");
  const match = /^## (\S+) - (\S+)$/.exec(heading.trim());
  if (!match) {
    throw new Error(`The changelog heading "${heading}" is not "## <version> - <YYYY-MM-DD>".`);
  }
  const [, version = "", date = ""] = match;
  if (!semver.test(version)) {
    throw new Error(`The changelog version "${version}" is not a SemVer version.`);
  }
  if (!isCalendarDate(date)) {
    throw new Error(`The changelog date "${date}" of ${version} is not a calendar date.`);
  }

  const [summary = "", ...parts] = `\n${lines.join("\n")}`.split(/\n(?=### )/);
  const sections: Partial<Record<SectionTitle, string>> = {};
  let last = -1;
  for (const part of parts) {
    const [sectionHeading = "", ...body] = part.split("\n");
    const title = sectionHeading.slice("### ".length).trim();
    const order = sectionTitles.indexOf(title as SectionTitle);
    if (order === -1) {
      throw new Error(
        `The changelog section "${title}" of ${version} is not one of ${sectionTitles.join(", ")}.`,
      );
    }
    if (order <= last) {
      throw new Error(
        `The changelog sections of ${version} must follow the order ${sectionTitles.join(", ")}.`,
      );
    }
    last = order;
    const markdown = body.join("\n").trim();
    if (markdown === "") {
      throw new Error(`The changelog section "${title}" of ${version} is empty.`);
    }
    sections[title as SectionTitle] = markdown;
  }

  if (parts.length === 0) throw new Error(`The changelog entry of ${version} lists no changes.`);
  if (sections["Cambios incompatibles"] !== undefined && sections["Cómo migrar"] === undefined) {
    throw new Error(
      `The changelog entry of ${version} has "Cambios incompatibles" without "Cómo migrar".`,
    );
  }

  return {
    version,
    date,
    stability: prerelease(version) === undefined ? "Estable" : "Prerelease",
    summary: summary.trim(),
    sections,
  };
}

/** The four sections of `release` in order, with wording for those it leaves out. */
export function releaseSections(release: Release): { title: SectionTitle; markdown: string }[] {
  return sectionTitles.map((title) => ({
    title,
    markdown: release.sections[title] ?? emptySections[title],
  }));
}

function isCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

function prerelease(version: string): string | undefined {
  return semver.exec(version)?.[4];
}

/**
 * Negative when `a` precedes `b` under SemVer precedence, positive when it
 * follows, and 0 when they are equal. Build metadata does not count.
 */
export function compareVersions(a: string, b: string): number {
  const [left, right] = [semver.exec(a), semver.exec(b)];
  if (!left || !right) throw new Error(`Cannot compare "${a}" and "${b}": not SemVer versions.`);
  for (const index of [1, 2, 3]) {
    const difference = Number(left[index]) - Number(right[index]);
    if (difference !== 0) return difference;
  }
  const [leftPre, rightPre] = [left[4], right[4]];
  if (leftPre === undefined || rightPre === undefined) {
    // A version without a pre-release identifier comes after one with it.
    return (leftPre === undefined ? 1 : 0) - (rightPre === undefined ? 1 : 0);
  }
  const [leftIds, rightIds] = [leftPre.split("."), rightPre.split(".")];
  for (let index = 0; index < Math.min(leftIds.length, rightIds.length); index++) {
    const difference = compareIdentifiers(leftIds[index] ?? "", rightIds[index] ?? "");
    if (difference !== 0) return difference;
  }
  return leftIds.length - rightIds.length;
}

function compareIdentifiers(a: string, b: string): number {
  const [aNumeric, bNumeric] = [/^\d+$/.test(a), /^\d+$/.test(b)];
  if (aNumeric && bNumeric) return Number(a) - Number(b);
  // Numeric identifiers come before alphanumeric ones.
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}
