/**
 * The body rows of the first Markdown table in `text`, cell by cell. Page
 * tests read a page's tables this way to check them against the code.
 */
export function tableRows(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith("|"));
  if (start === -1) return [];
  const end = lines.findIndex((line, index) => index > start && !line.startsWith("|"));
  return lines.slice(start + 2, end === -1 ? undefined : end).map((line) =>
    line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim()),
  );
}
