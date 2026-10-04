import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ayniSdkSource from "../../../../packages/sdk_flutter/lib/src/ayni_sdk.dart?raw";
import evidenceEventSource from "../../../../packages/sdk_flutter/lib/src/evidence_event.dart?raw";
import evidenceQueueStatusSource from "../../../../packages/sdk_flutter/lib/src/evidence_queue_status.dart?raw";
import pubspec from "../../../../packages/sdk_flutter/pubspec.yaml?raw";
import { tableRows } from "../markdown-table";
import { dartEnumValues } from "../sdk/dart-enum";
import { syncResourceMessages } from "../sdk/sync-messages";
import { apiDocumentPath, sdkContract } from "./http-reference";
import { statusEnumDrift } from "./status-enums";

const docsRoot = join(import.meta.dirname, "..", "content", "docs");
const page = readFileSync(join(docsRoot, "referencia/estados-y-errores.md"), "utf8").replace(
  /\r\n/g,
  "\n",
);

/** The text of the `## …` section `heading`, up to the next `## ` heading. */
function section(heading: string): string {
  const start = page.indexOf(`\n${heading}\n`);
  if (start === -1) throw new Error(`The page has no "${heading}" section.`);
  const next = page.indexOf("\n## ", start + 1);
  return page.slice(start, next === -1 ? undefined : next);
}

/** The first cell of each row, without its backticks, in order and without repeats. */
function documentedValues(rows: string[][]): string[] {
  return [...new Set(rows.map((row) => (row[0] ?? "").replace(/`/g, "")))];
}

/** A message as the page quotes it: each interpolation as a named placeholder. */
function quoted(message: string): string {
  return message.replace("$name", "`<nombre>`").replace("$dependencyName", "`<modelo>`");
}

/** Each `code` the `/sdk/*` endpoints answer with, in the order of the API document. */
function sdkErrorCodes(): string[] {
  type Response = {
    content?: { "application/json"?: { schema?: { properties?: { code?: { enum?: string[] } } } } };
  };
  const document = sdkContract(JSON.parse(readFileSync(apiDocumentPath, "utf8")));
  const codes = Object.values(document.paths).flatMap((path) =>
    Object.values(path as Record<string, { responses?: Record<string, Response> }>).flatMap(
      (operation) =>
        Object.values(operation.responses ?? {}).flatMap(
          (response) =>
            response.content?.["application/json"]?.schema?.properties?.code?.enum ?? [],
        ),
    ),
  );
  return [...new Set(codes)];
}

describe("Estados y errores (US-146)", () => {
  it("says which SDK version it documents", () => {
    const version = /^version: (\S+)$/m.exec(pubspec)?.[1];

    expect(page).toContain(`Esta página describe \`ayni_sdk\` ${version}.`);
  });

  it("documents exactly the values of each SDK enum it tabulates (US-150)", () => {
    expect(
      statusEnumDrift(
        page,
        "referencia/estados-y-errores.md",
        `${ayniSdkSource}\n${evidenceEventSource}\n${evidenceQueueStatusSource}`,
      ),
    ).toEqual([]);
  });

  it("gives the message of every EvidenceEvent (US-066 to US-068)", () => {
    const rows = tableRows(section("## Evidencia para datasets"));
    const messages = Object.fromEntries(
      [...evidenceEventSource.matchAll(/EvidenceEvent\.(\w+) =>\s*'([^']+)'/g)].map(
        ([, event, message]) => [event, message],
      ),
    );

    expect(documentedValues(rows)).toEqual(dartEnumValues(evidenceEventSource, "EvidenceEvent"));
    for (const row of rows) {
      expect(row.at(-1), row[0]).toBe(`\`${messages[(row[0] ?? "").replace(/`/g, "")]}\``);
    }
  });

  it("gives the message of every EvidenceQueueStatus (US-069)", () => {
    const rows = tableRows(section("## Cola de evidencia"));
    const messages = Object.fromEntries(
      [...evidenceQueueStatusSource.matchAll(/EvidenceQueueStatus\.(\w+) =>\s*'([^']+)'/g)].map(
        ([, status, message]) => [status, message],
      ),
    );

    expect(documentedValues(rows)).toEqual(
      dartEnumValues(evidenceQueueStatusSource, "EvidenceQueueStatus"),
    );
    for (const row of rows) {
      expect(row.at(-1), row[0]).toBe(`\`${messages[(row[0] ?? "").replace(/`/g, "")]}\``);
    }
  });

  it("gives the message of every InitializationStatus", () => {
    const rows = tableRows(section("## Inicialización del SDK"));
    const messages = Object.fromEntries(
      [...ayniSdkSource.matchAll(/status: InitializationStatus\.(\w+),\s*message: '([^']+)'/g)].map(
        ([, status, message]) => [status, message],
      ),
    );

    expect(documentedValues(rows)).toEqual(dartEnumValues(ayniSdkSource, "InitializationStatus"));
    for (const row of rows) {
      expect(row.at(-1), row[0]).toBe(`\`${messages[(row[0] ?? "").replace(/`/g, "")]}\``);
    }
  });

  it("explains every SyncStatus and what the app should show", () => {
    const rows = tableRows(section("## Estado general"));

    expect(documentedValues(rows)).toEqual(dartEnumValues(ayniSdkSource, "SyncStatus"));
    expect(rows.filter((row) => row.length !== 3 || row.some((cell) => cell === ""))).toEqual([]);
  });

  it("lists every SyncResourceStatus", () => {
    const rows = tableRows(section("## Estado de cada recurso"));

    expect(documentedValues(rows)).toEqual(dartEnumValues(ayniSdkSource, "SyncResourceStatus"));
  });

  it("quotes each message exactly as SyncResourceResult.message returns it", () => {
    const rows = tableRows(section("## Estado de cada recurso"));
    const messages = syncResourceMessages(ayniSdkSource);

    expect(messages.filter(({ message }) => quoted(message).includes("$"))).toEqual([]);
    expect(rows.map((row) => row.at(-1))).toEqual([
      "`null`",
      "`null`",
      ...messages.map(({ message }) => quoted(message)),
    ]);
    expect(rows.slice(2).map((row) => row[0])).toEqual(
      messages.map(({ status }) => `\`${status}\``),
    );
  });

  it("says whether the previous version was kept for each message", () => {
    const rows = tableRows(section("## Estado de cada recurso")).slice(2);
    const messages = syncResourceMessages(ayniSdkSource);

    messages.forEach(({ previousVersionRetained }, index) => {
      const kept = rows[index]?.[2] ?? "";
      if (previousVersionRetained === true) expect(kept).toMatch(/^Sí/);
      else if (previousVersionRetained === false) expect(kept).toMatch(/^No/);
      else expect(kept).not.toBe("");
    });
  });

  it("gives the symptom the app sees for each error code of the SDK endpoints", () => {
    const rows = tableRows(section("## Errores HTTP del servidor"));

    expect(rows.map((row) => (row[0] ?? "").replace(/`/g, ""))).toEqual(sdkErrorCodes());
    expect(sdkErrorCodes()).toEqual([
      "invalidConsent",
      "invalidCredential",
      "credentialRevoked",
      "consentReceiptConflict",
      "privacyNoticeUnavailable",
      "invalidTrace",
      "telemetryDisabled",
      "traceConflict",
      "traceTooLarge",
      "workflowVersionNotFound",
      "modelVersionNotFound",
    ]);
    for (const row of rows) {
      const code = (row[0] ?? "").replace(/`/g, "");
      expect(row.at(-1), row[0]).toContain(
        ["invalidConsent", "consentReceiptConflict", "privacyNoticeUnavailable"].includes(code)
          ? "`ConsentStatus.pending`"
          : ["invalidTrace", "traceTooLarge", "telemetryDisabled", "traceConflict"].includes(code)
            ? "outbox"
            : "`SyncStatus.error`",
      );
    }
  });

  it("warns that the app never receives the HTTP status code", () => {
    expect(section("## Errores HTTP del servidor")).toContain(
      ":::note\nEl SDK no expone el código HTTP a la app: ante una credencial revocada devuelve `SyncStatus.error`.\n:::",
    );
  });

  it("sends the reader to the troubleshooting guide", () => {
    expect(page).toContain(
      "[Solucionar problemas de sincronización](/guias/solucionar-problemas-de-sincronizacion/)",
    );
  });
});
