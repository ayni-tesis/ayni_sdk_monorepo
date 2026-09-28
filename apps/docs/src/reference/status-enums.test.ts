import { describe, expect, it } from "vitest";
import { statusEnumDrift } from "./status-enums";

const sdk = [
  "enum SyncStatus {",
  "  updated,",
  "  upToDate,",
  "  offline,",
  "}",
  "",
  "class SyncResult {}",
].join("\n");

function page(...rows: string[]): string {
  return [
    "## Estado general",
    "",
    "| `SyncStatus` | Significado |",
    "| --- | --- |",
    ...rows,
    "",
    "| Código | Qué ve la app |",
    "| --- | --- |",
    "| `invalidCredential` | `SyncStatus.error` |",
  ].join("\n");
}

describe("statusEnumDrift", () => {
  it("accepts a table with one or more rows for every value of its enum", () => {
    const text = page(
      "| `updated` | a |",
      "| `upToDate` | b |",
      "| `offline` | c |",
      "| `offline` | d |",
    );

    expect(statusEnumDrift(text, "referencia/estados.md", sdk)).toEqual([]);
  });

  it("names the table of an enum value the page does not document", () => {
    const text = page("| `updated` | a |", "| `offline` | c |");

    expect(statusEnumDrift(text, "referencia/estados.md", sdk)).toEqual([
      "Estado sin documentar: SyncStatus.upToDate en referencia/estados.md:3",
    ]);
  });

  it("names the row of a value the SDK no longer has, as after a rename", () => {
    const text = page(
      "| `updated` | a |",
      "| `alDia` | b |",
      "| `upToDate` | b |",
      "| `offline` | c |",
    );

    expect(statusEnumDrift(text, "referencia/estados.md", sdk)).toEqual([
      "Estado inexistente en el SDK: SyncStatus.alDia en referencia/estados.md:6",
    ]);
  });

  it("names a table headed by an enum the SDK does not declare", () => {
    const text = "| `SyncState` | Significado |\n| --- | --- |\n| `updated` | a |";

    expect(statusEnumDrift(text, "referencia/estados.md", sdk)).toEqual([
      "Enum inexistente en el SDK: SyncState en referencia/estados.md:1",
    ]);
  });
});
