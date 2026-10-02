import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import pubspec from "../../../../packages/sdk_flutter/pubspec.yaml?raw";
import { dashboardTexts, quotedTexts } from "../guides/dashboard-texts";
import { tableRows } from "../markdown-table";
import { sdkVersion } from "../reference/dart-reference";
import { sdkLibrarySource, sdkRequests, storagePathParts } from "../sdk/sdk-data";

const repositoryRoot = join(import.meta.dirname, "..", "..", "..", "..");
const page = readFileSync(
  join(import.meta.dirname, "..", "content", "docs", "recursos", "datos-y-privacidad.mdx"),
  "utf8",
).replace(/\r\n/g, "\n");
const version = sdkVersion(pubspec);
const source = sdkLibrarySource();
const requests = sdkRequests(source);

/** The text of the `## …` section `heading`, up to the next `## ` heading. */
function section(heading: string): string {
  const start = page.indexOf(`\n${heading}\n`);
  if (start === -1) throw new Error(`The page has no "${heading}" section.`);
  const next = page.indexOf("\n## ", start + 1);
  return page.slice(start, next === -1 ? undefined : next);
}

/** The code spans of `text`, without their backticks. */
function codeSpans(text: string): string[] {
  return [...text.matchAll(/`([^`\n]+)`/g)].map(([, code]) => code ?? "");
}

const sentRows = tableRows(section("## Datos que el SDK envía"));
const storedSection = section("## Datos que el SDK guarda en el dispositivo");

/**
 * The epics whose stories add data the SDK sends or stores, or the policy,
 * consent or retention that governs it. Each of their stories updates this
 * page (US-147).
 */
const dataEpics = ["observabilidad-telemetria-diagnostico", "recoleccion-evidencia-datasets"];

/** Their stories that change only the dashboard or the workflow editor. */
const dashboardOnlyStories = ["US-064", "US-065", "US-108", "US-109", "US-110", "US-111"];

/** Each story of `epic`, as its ID and its text. */
function stories(epic: string): { id: string; text: string }[] {
  const directory = join(repositoryRoot, "docs", "epicas", epic);
  return readdirSync(directory)
    .filter((file) => /^US-\d+-.*\.md$/.test(file))
    .map((file) => ({
      id: /^US-\d+/.exec(file)?.[0] ?? file,
      text: readFileSync(join(directory, file), "utf8"),
    }));
}

/** A cell that starts with the word `Sí` or `No`. */
const yesOrNo = /^(Sí|No)(?![\p{L}\p{N}])/u;

describe("Datos y privacidad (US-147)", () => {
  it("says under each table which SDK version it is valid for", () => {
    for (const text of [section("## Datos que el SDK envía"), storedSection]) {
      expect(text).toContain(`Válido para \`ayni_sdk\` ${version}.`);
    }
  });

  it("says it is not legal advice", () => {
    expect(page).toContain("No constituye asesoría legal");
  });

  it("lists every request the SDK makes, with where it goes", () => {
    const documented = sentRows.map((row) => codeSpans(row[2] ?? "")[0]).sort();

    expect(documented).toEqual(requests.map(({ method, target }) => `${method} ${target}`).sort());
    expect(sentRows.filter((row) => row.length !== 4 || row.some((cell) => cell === ""))).toEqual(
      [],
    );
  });

  it("says which requests carry the credential", () => {
    for (const row of sentRows) {
      const request = requests.find(
        ({ method, target }) => `${method} ${target}` === codeSpans(row[2] ?? "")[0],
      );
      expect(row[0]?.startsWith("La credencial del SDK"), row[2]).toBe(request?.sendsCredential);
    }
  });

  it("sends the credential only to the server's /sdk/* endpoints, never through a redirect", () => {
    expect(
      requests.filter((request) => request.sendsCredential && !request.target.startsWith("/sdk/")),
    ).toEqual([]);
    expect(requests.filter((request) => request.followsRedirects)).toEqual([]);
    expect(page).toContain("El SDK no sigue redirecciones");
  });

  it("describes optional data only when some sent datum is optional", () => {
    const optional = sentRows.filter((row) => yesOrNo.exec(row[3] ?? "")?.[1] === "Sí");

    expect(yesOrNo.test("Sí, con consentimiento")).toBe(true);
    expect(sentRows.filter((row) => !yesOrNo.test(row[3] ?? ""))).toEqual([]);
    expect(page.includes("\n## Datos opcionales\n")).toBe(optional.length > 0);
  });

  it("states what the SDK does not do while only consent receipts carry a body", () => {
    const doesNot = section("## Lo que el SDK no hace");

    expect(
      requests.filter((request) => request.sendsBody).map((request) => request.target),
    ).toEqual(["/sdk/consents"]);
    expect(
      requests.flatMap(({ headers }) =>
        headers.filter((header) => header !== "HttpHeaders.authorizationHeader"),
      ),
    ).toEqual([]);
    expect(doesNot).toContain("No sube imágenes ni entradas del modelo durante la sincronización.");
    expect(doesNot).toContain("No envía telemetría.");
    expect(doesNot).toContain("`AyniSdk.getDeviceProfile()`");
    expect(doesNot.replace(/\s+/g, " ")).toContain("no se guarda ni se envía");
    expect(doesNot).toContain("seriales, fingerprints");
    expect(doesNot).toContain("rango de RAM y SoC cuando esté disponible");
    expect(doesNot).toContain("dentro de `storageDirectory`");
    expect(doesNot).toContain("no se envía");
  });

  it("names Dart's own User-Agent, which the SDK leaves unchanged", () => {
    expect(source).not.toMatch(/userAgent|user-agent/i);
    expect(page).toContain("`Dart/<versión> (dart:io)`");
  });

  it("lists every file and directory the SDK creates in storageDirectory", () => {
    const spans = codeSpans(storedSection);
    const { names, extensions } = storagePathParts(source);

    expect(names.filter((name) => !spans.some((span) => span.includes(name)))).toEqual([]);
    expect(
      extensions.filter((extension) => !spans.some((span) => span.includes(extension))),
    ).toEqual([]);
    expect(
      tableRows(storedSection).filter((row) => row.length !== 3 || row.some((cell) => cell === "")),
    ).toEqual([]);
    expect(storedSection).toContain("`installation-id`");
  });

  it("shows how to delete the data with an example CI analyzes", () => {
    expect(storedSection).toContain('<Code code={privacy.deleteData} lang="dart" />');
  });

  it("quotes the dashboard exactly", () => {
    const texts = dashboardTexts();
    const quotes = quotedTexts(page);

    expect(quotes.length).toBeGreaterThan(0);
    expect(quotes.filter((quote) => !texts.has(quote))).toEqual([]);
  });

  it("is updated by every story that changes the data the SDK sends or stores", () => {
    const all = dataEpics.flatMap(stories);
    const missing = all.filter(
      ({ id, text }) =>
        !dashboardOnlyStories.includes(id) &&
        !(text.split("## Criterios de aceptación")[1] ?? "").includes(
          "`Recursos` → `Datos y privacidad`",
        ),
    );

    expect(dashboardOnlyStories.filter((story) => !all.some(({ id }) => id === story))).toEqual([]);
    expect(missing.map(({ id }) => id)).toEqual([]);
  });
});
