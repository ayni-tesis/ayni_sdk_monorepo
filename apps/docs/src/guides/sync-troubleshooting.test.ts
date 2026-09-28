import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dashboardTexts, quotedTexts } from "./dashboard-texts";

const docsRoot = join(import.meta.dirname, "..", "content", "docs");
const page = readFileSync(
  join(docsRoot, "guias/solucionar-problemas-de-sincronizacion.md"),
  "utf8",
).replace(/\r\n/g, "\n");

/** Each `## …` section of the guide, up to the next `##` heading. */
const sections = page
  .split(/\n(?=## )/)
  .filter((part) => part.startsWith("## "))
  .map((part) => ({ heading: part.slice(3, part.indexOf("\n")), text: part }));

const reportHeading = "Mi síntoma no aparece en esta guía";
const entries = sections.filter(({ heading }) => heading !== reportHeading);

/** The part of an entry from `**label:**` up to the next label or aside. */
function field(text: string, label: string): string {
  const start = text.indexOf(`**${label}:**`);
  if (start === -1) return "";
  const end = /\n(\*\*|:::)/.exec(text.slice(start + 1));
  return text.slice(start, end ? start + 1 + end.index : undefined);
}

/** What the app never receives: the server's HTTP statuses and error codes. */
const internalCodes = [
  "401",
  "404",
  "invalidCredential",
  "credentialRevoked",
  "workflowVersionNotFound",
  "modelVersionNotFound",
];

describe("Solucionar problemas de sincronización (US-146)", () => {
  it("has one entry per symptom, starting with error and offline", () => {
    expect(entries.map(({ heading }) => heading).slice(0, 2)).toEqual([
      "`sync()` devuelve `error` en cada intento",
      "`sync()` devuelve `offline`",
    ]);
  });

  it("gives every entry a symptom, its probable causes and how to solve it, in that order", () => {
    const incomplete = entries.filter(({ text }) => {
      const positions = ["Síntoma", "Causas probables", "Cómo resolverlo"].map((label) =>
        text.indexOf(`**${label}:**`),
      );
      return (
        positions.some((position) => position === -1) ||
        positions.join() !== [...positions].sort((a, b) => a - b).join()
      );
    });

    expect(incomplete.map(({ heading }) => heading)).toEqual([]);
  });

  it("describes each symptom as the app sees it, not by a code the app never receives", () => {
    const leaking = entries.filter(({ heading, text }) =>
      internalCodes.some((code) => heading.includes(code) || field(text, "Síntoma").includes(code)),
    );

    expect(leaking.map(({ heading }) => heading)).toEqual([]);
  });

  it("solves a revoked credential by checking the dashboard and generating a new one", () => {
    const entry = entries[0]?.text ?? "";

    expect(field(entry, "Causas probables")).toContain("revocada");
    expect(field(entry, "Causas probables")).toContain("`https`");
    expect(field(entry, "Causas probables")).toContain("`syncTimeout`");
    expect(entry).toContain("«Revocada»");
    expect(entry).toContain("«Generar credencial»");
    expect(entry).toContain(
      ":::note\nEl SDK no expone el código HTTP a la app: ante una credencial revocada devuelve `SyncStatus.error`.\n:::",
    );
  });

  it("ends by explaining how to report an undocumented symptom without the credential", () => {
    const last = sections.at(-1);

    expect(last?.heading).toBe(reportHeading);
    expect(last?.text).toContain("https://github.com/ayni-tesis/ayni_sdk_monorepo/issues/new");
    expect(last?.text).toMatch(/\n- /);
    expect(last?.text).toContain(":::caution[Advertencia]\nNo compartas la credencial");
  });

  it("links the reference with the exact states and messages", () => {
    expect(page).toContain("[Estados y errores](/referencia/estados-y-errores/)");
  });

  it("quotes only texts the dashboard shows", () => {
    const texts = dashboardTexts();
    const quoted = quotedTexts(page);

    expect(quoted.length).toBeGreaterThan(0);
    expect(quoted.filter((text) => !texts.has(text))).toEqual([]);
  });
});
