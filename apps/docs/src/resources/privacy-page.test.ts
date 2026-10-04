import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import collectionPolicySource from "../../../../packages/api/src/collection-policy.ts?raw";
import ayniSdkSource from "../../../../packages/sdk_flutter/lib/src/ayni_sdk.dart?raw";
import sdkCollectionPolicySource from "../../../../packages/sdk_flutter/lib/src/collection_policy_store.dart?raw";
import evidenceEventSource from "../../../../packages/sdk_flutter/lib/src/evidence_event.dart?raw";
import evidenceStoreSource from "../../../../packages/sdk_flutter/lib/src/evidence_store.dart?raw";
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
const androidManifest = readFileSync(
  join(repositoryRoot, "packages", "sdk_flutter", "android", "src", "main", "AndroidManifest.xml"),
  "utf8",
);
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

  it("excludes raw inference inputs and documents policy-gated trace upload", () => {
    const doesNot = section("## Lo que el SDK no hace");

    expect(
      requests.filter((request) => request.sendsBody).map((request) => request.target),
    ).toEqual(["/sdk/consents", "/sdk/traces", "/sdk/evidence", "<uploadUrl>"]);
    // Besides the credential, a request only declares the type of the body it sends.
    expect(
      requests.flatMap(({ headers, sendsBody }) =>
        headers.filter(
          (header) =>
            header !== "HttpHeaders.authorizationHeader" &&
            !(sendsBody && header === "HttpHeaders.contentTypeHeader"),
        ),
      ),
    ).toEqual([]);
    expect(
      requests.filter(
        (request) =>
          request.sendsBody && !request.headers.includes("HttpHeaders.contentTypeHeader"),
      ),
    ).toEqual([]);
    expect(page).toContain("`Content-Type`");
    expect(doesNot.replace(/\s+/g, " ")).toContain(
      "No sube imágenes ni entradas del modelo, salvo la copia optimizada de cada evidencia para datasets",
    );
    expect(doesNot).toContain("`POST /sdk/traces`");
    expect(doesNot).toContain("`diagnostics/trace-outbox/`");
    expect(doesNot).toContain("`AyniSdk.getDeviceProfile()`");
    expect(doesNot).toContain("La respuesta de `getDeviceProfile()` queda en");
    expect(doesNot.replace(/\s+/g, " ")).toContain(
      "sus campos del perfil se guardan dentro de esa traza y se envían junto con ella",
    );
    expect(doesNot).toContain("seriales, fingerprints");
    expect(doesNot.replace(/\s+/g, " ")).toContain("rango de RAM y SoC;");
    expect(doesNot).toContain("dentro de `storageDirectory`");
    expect(doesNot.replace(/\s+/g, " ")).toContain(
      "Omite mensajes arbitrarios del runtime, imágenes, tensores y bytes de entrada.",
    );
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
    expect(storedSection).toContain("`diagnostics/telemetry-policy.json`");
  });

  it("describes the optimized evidence image and the collection policy that sets it (US-067)", () => {
    const evidence = section("## Evidencia para datasets").replace(/\s+/g, " ");

    expect(evidence).toContain("`GET /sdk/collection-policy`");
    expect(evidence).toContain("`diagnostics/collection-policy.json`");
    expect(evidence).toContain("«Tamaño máximo»");
    expect(evidence).toContain("«Calidad»");
    expect(evidence).toContain("sin metadatos EXIF");
    expect(evidence).toContain(
      "La imagen que recibió `run()`, con la que el workflow hizo la inferencia, no cambia",
    );
    expect(evidence).toContain("`evidenceConsent: true`");
    expect(evidence).toContain("no vence");
    expect(storedSection).toContain("`diagnostics/collection-policy.json`");
  });

  it("describes the local queue of evidence pending upload and a full device (US-068)", () => {
    const evidence = section("## Evidencia para datasets").replace(/\s+/g, " ");

    expect(evidence).toContain("### Evidencia pendiente de envío");
    expect(evidence).toContain('<Code code={privacy.pendingEvidence} lang="dart" />');
    expect(evidence).toContain("`pendingEvidenceCount()`");
    expect(evidence).toContain("aunque la app se reinicie");
    expect(evidence).toContain("nunca marca una como enviada");
    expect(evidence).toContain(
      "`evidenceStorageFull` con `No se pudo guardar una imagen para el dataset; el análisis se completó normalmente.`",
    );
    expect(evidence).toContain("no vence");
  });

  it("describes the network evidence may use and the state of its queue (US-069)", () => {
    const evidence = section("## Evidencia para datasets").replace(/\s+/g, " ");
    const networks = (pattern: RegExp, source: string) => {
      const match = pattern.exec(source);
      if (!match) throw new Error(`No match for ${pattern} any more; update this test.`);
      return [...(match[1] ?? "").matchAll(/\w+/g)].map(([name]) => name);
    };

    expect(evidence).toContain("### Red permitida para enviar evidencia");
    expect(evidence).toContain('<Code code={privacy.evidenceQueueStatus} lang="dart" />');
    expect(evidence).toContain("«Solo Wi-Fi»");
    expect(evidence).toContain("«Wi-Fi y datos móviles»");
    expect(evidence).toContain("`waitingForWifi`, con el texto `Pendiente de Wi-Fi`");
    expect(evidence).toContain("no inicia ninguna carga ni usa datos móviles");
    expect(evidence).toContain("No guarda ni envía el tipo de conexión");
    expect(storedSection).toContain("`network`");
    expect(networks(/enum CollectionNetwork \{([^}]*)\}/, sdkCollectionPolicySource)).toEqual(
      networks(/COLLECTION_NETWORKS = \[([^\]]*)\]/, collectionPolicySource),
    );
  });

  it("describes the upload of evidence, its confirmation and its retention (US-070)", () => {
    const evidence = section("## Evidencia para datasets").replace(/\s+/g, " ");
    const events = Object.fromEntries(
      [...evidenceEventSource.matchAll(/EvidenceEvent\.(\w+) =>\s*'([^']+)'/g)].map(
        ([, event, message]) => [event, message],
      ),
    );

    expect(evidence).toContain("### Envío de la evidencia");
    expect(evidence).toContain('<Code code={privacy.uploadEvidence} lang="dart" />');
    for (const request of [
      "`POST /sdk/evidence`",
      "`PUT <uploadUrl>`",
      "`POST /sdk/evidence/<evidenceId>/complete`",
    ]) {
      expect(evidence).toContain(request);
    }
    for (const event of [
      "evidenceUploading",
      "evidenceReceived",
      "evidenceUploadFailed",
      "evidenceCredentialRevoked",
    ]) {
      expect(evidence).toContain(`\`${event}\` (\`${events[event]}\`)`);
    }
    expect(evidence).toContain("`received.json`");
    expect(evidence).toContain("### Retención de la evidencia en el servidor");
    expect(storedSection).toContain("`evidence/<evidenceId>/received.json`");
  });

  it("describes the retries of evidence, their limit and the failed evidence it keeps (US-071)", () => {
    const evidence = section("## Evidencia para datasets").replace(/\s+/g, " ");
    const retries = evidence.slice(evidence.indexOf("### Reintentos de la evidencia"));
    const events = Object.fromEntries(
      [...evidenceEventSource.matchAll(/EvidenceEvent\.(\w+) =>\s*'([^']+)'/g)].map(
        ([, event, message]) => [event, message],
      ),
    );
    const defaultAttempts = /this\.maxEvidenceUploadAttempts = (\d+)/.exec(ayniSdkSource)?.[1];

    expect(defaultAttempts, "the default limit changed; update this test").toBeDefined();
    expect(evidence).toContain("### Reintentos de la evidencia");
    expect(retries).toContain('<Code code={privacy.evidenceStatus} lang="dart" />');
    expect(retries).toContain(
      `\`maxEvidenceUploadAttempts\` de \`AyniSdk\` o de \`AyniConfig\`, ${defaultAttempts} si`,
    );
    expect(retries).toContain(
      `\`evidenceRetriesExhausted\` con \`${events.evidenceRetriesExhausted}\``,
    );
    expect(retries).toContain("`evidence/<evidenceId>/upload-attempts.json`");
    expect(retries).toContain("no cuenta como intento");
    for (const status of ["Pendiente", "Enviando", "Reintentando", "Enviada", "Fallida"]) {
      expect(retries).toContain(`\`${status}\``);
    }
    expect(retries).toContain("no vence");
    const firstWait = /const first = Duration\(minutes: (\d+)\);/.exec(evidenceStoreSource)?.[1];
    const longestWait = /const longest = Duration\(hours: (\d+)\);/.exec(evidenceStoreSource)?.[1];
    expect(firstWait, "evidenceRetryDelay changed; update this test").toBeDefined();
    expect(longestWait, "evidenceRetryDelay changed; update this test").toBeDefined();
    expect(retries).toContain(
      `una espera de ${firstWait} minutos después del primer fallo, el doble después de cada uno de los siguientes y como máximo ${longestWait} horas`,
    );
    expect(retries).not.toContain("no limita los reintentos");
    expect(evidence).not.toContain("no limita los reintentos");
    expect(storedSection).toContain("`evidence/<evidenceId>/upload-attempts.json`");
  });

  it("describes that the SDK deletes the local copy of a confirmed evidence and keeps the rest (US-072)", () => {
    const evidence = section("## Evidencia para datasets").replace(/\s+/g, " ");
    const heading = "### Retención de la evidencia en el dispositivo";
    const local = evidence.slice(
      evidence.indexOf(heading),
      evidence.indexOf("### Retención de la evidencia en el servidor"),
    );

    expect(evidence).toContain(heading);
    for (const text of [
      "elimina el directorio `evidence/<evidenceId>/` completo",
      "`received.json`",
      "`upload-attempts.json`",
      "`evidenceReceived`",
      "`Enviando`",
      "`Enviada`",
      "Una carga incierta conserva la evidencia",
      "no elimina nada",
      "`Fallida`",
      "no toca workflows, modelos instalados",
      "no sigue enlaces",
      "`evidence/<evidenceId>.tmp/`",
    ]) {
      expect(local).toContain(text);
    }
    expect(evidence).not.toContain("conserva la copia local de la evidencia recibida");
    expect(evidence).not.toContain("también la que ya se envió");
    const rows = tableRows(storedSection).filter((row) =>
      ["image", "evidence.json", "received.json", "upload-attempts.json"].some((file) =>
        row[1]?.includes(`\`evidence/<evidenceId>/${file}\``),
      ),
    );
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row[2], row[1]).toMatch(/^`sync\(\)` l[oa] elimina/);
      expect(row[2], row[1]).not.toContain("también la enviada");
    }
  });

  it("names every Android permission the SDK adds to the app", () => {
    const permissions = [...androidManifest.matchAll(/android:name="android\.permission\.(\w+)"/g)];

    expect(permissions.length).toBeGreaterThan(0);
    for (const [, permission] of permissions) {
      expect(page).toContain(`\`${permission}\``);
    }
  });

  it("gives the size and quality ranges and defaults that the server and the SDK apply", () => {
    const range = (source: string, pattern: RegExp) => {
      const match = pattern.exec(source);
      if (!match) throw new Error(`No range matches ${pattern} any more; update this test.`);
      return { min: Number(match[1]), max: Number(match[2]) };
    };
    const defaults = /DEFAULT_COLLECTION_POLICY[^{]*\{([^}]*)\}/.exec(collectionPolicySource)?.[1];
    const size = range(
      collectionPolicySource,
      /COLLECTION_MAX_IMAGE_SIZE = \{ min: (\d+), max: (\d+) \}/,
    );
    const quality = range(
      collectionPolicySource,
      /COLLECTION_IMAGE_QUALITY = \{ min: (\d+), max: (\d+) \}/,
    );
    const defaultSize = /maxImageSize: (\d+)/.exec(defaults ?? "")?.[1];
    const defaultQuality = /imageQuality: (\d+)/.exec(defaults ?? "")?.[1];
    const evidence = section("## Evidencia para datasets").replace(/\s+/g, " ");

    expect(
      range(sdkCollectionPolicySource, /maxImageSizeRange = \(min: (\d+), max: (\d+)\)/),
    ).toEqual(size);
    expect(
      range(sdkCollectionPolicySource, /imageQualityRange = \(min: (\d+), max: (\d+)\)/),
    ).toEqual(quality);
    expect(evidence).toContain(
      `de ${size.min} a ${size.max} píxeles, ${defaultSize} si nadie lo cambió`,
    );
    expect(evidence).toContain(
      `de ${quality.min} a ${quality.max}, ${defaultQuality} si nadie la cambió`,
    );
  });

  it("shows how to delete the data with an example CI analyzes", () => {
    expect(storedSection).toContain('<Code code={privacy.deleteData} lang="dart" />');
  });

  it("documents installation ID rotation and the identity of pending traces", () => {
    const resetSection = section("## Restablecer el identificador de instalación").replace(
      /\s+/g,
      " ",
    );

    expect(resetSection).toContain("`FileSystemException`");
    expect(resetSection).toContain("trazas ya creadas, incluidas las pendientes");
    expect(resetSection).toContain("`sdkImprovement` no autoriza la validación");
    expect(resetSection).toContain("no vencen localmente");
    expect(resetSection).toContain("7, 30 o 90 días");
    expect(resetSection).toContain('<Code code={privacy.resetInstallationId} lang="dart" />');
    expect(resetSection).toContain("no elimina workflows, modelos ni trazas pendientes");
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
