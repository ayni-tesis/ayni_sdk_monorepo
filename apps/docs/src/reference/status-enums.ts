import { dartEnumValues } from "../sdk/dart-enum";

/**
 * The differences between the enum tables of `page` (found at `pagePath`)
 * and the Dart `source` that declares those enums. An enum table is one whose
 * first header cell is a Dart type in backticks, such as `SyncStatus`, and
 * whose rows start with its values; a value may take several rows. Each
 * difference names the page and line: the header of a table that lacks a
 * value, or the row of a value the SDK does not have (US-146, US-150).
 */
export function statusEnumDrift(page: string, pagePath: string, source: string): string[] {
  const lines = page.split(/\r?\n/);
  return lines.flatMap((line, index) => {
    const enumName = /^\|\s*`([A-Z]\w*)`\s*\|/.exec(line)?.[1];
    if (!enumName || lines[index - 1]?.startsWith("|")) return [];
    const at = (lineIndex: number) => `${pagePath}:${lineIndex + 1}`;

    let values: string[];
    try {
      values = dartEnumValues(source, enumName);
    } catch {
      return [`Enum inexistente en el SDK: ${enumName} en ${at(index)}`];
    }

    const rows: { value: string; index: number }[] = [];
    for (let row = index + 2; lines[row]?.startsWith("|"); row++) {
      const value = /^\|\s*`?([^`|]*?)`?\s*\|/.exec(lines[row] ?? "")?.[1] ?? "";
      rows.push({ value, index: row });
    }
    const documented = new Set(rows.map(({ value }) => value));
    return [
      ...values
        .filter((value) => !documented.has(value))
        .map((value) => `Estado sin documentar: ${enumName}.${value} en ${at(index)}`),
      ...rows
        .filter(({ value }) => !values.includes(value))
        .map(
          ({ value, index: row }) =>
            `Estado inexistente en el SDK: ${enumName}.${value} en ${at(row)}`,
        ),
    ];
  });
}
