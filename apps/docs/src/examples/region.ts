/**
 * The block of an example file between `// #region <name>` and
 * `// #endregion <name>`, without its blank edge lines or the indentation its
 * lines share. Pages show code this way so every snippet comes from a file CI
 * analyzes (US-139).
 */
export function exampleRegion(source: string, name: string): string {
  const lines = source.split(/\r?\n/);
  const starts = markerLines(lines, `// #region ${name}`);
  const ends = markerLines(lines, `// #endregion ${name}`);
  if (starts.length > 1 || ends.length > 1) {
    throw new Error(`The example repeats the "${name}" region.`);
  }
  const [start, end] = [starts[0], ends[0]];
  if (start === undefined || end === undefined || end < start) {
    throw new Error(`The example has no "${name}" region.`);
  }
  const body = lines.slice(start + 1, end);
  const first = body.findIndex((line) => line.trim() !== "");
  if (first === -1) throw new Error(`The example's "${name}" region is empty.`);
  const code = body.slice(first, body.findLastIndex((line) => line.trim() !== "") + 1);
  const indent = Math.min(
    ...code.filter((line) => line.trim() !== "").map((line) => line.search(/\S/)),
  );
  return code.map((line) => line.slice(indent)).join("\n");
}

function markerLines(lines: string[], marker: string): number[] {
  return lines.flatMap((line, index) => (line.trim() === marker ? [index] : []));
}
