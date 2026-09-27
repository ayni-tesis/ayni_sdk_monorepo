/**
 * The block of an example file between `// #region <name>` and
 * `// #endregion <name>`, without the indentation its lines share. Pages show
 * code this way so every snippet comes from a file CI analyzes (US-139).
 */
export function exampleRegion(source: string, name: string): string {
  const lines = source.split(/\r?\n/);
  const starts = markerLines(lines, `// #region ${name}`);
  const ends = markerLines(lines, `// #endregion ${name}`);
  if (starts.length > 1 || ends.length > 1) {
    throw new Error(`El ejemplo repite la región «${name}».`);
  }
  const [start, end] = [starts[0], ends[0]];
  if (start === undefined || end === undefined || end < start) {
    throw new Error(`El ejemplo no tiene la región «${name}».`);
  }
  const body = lines.slice(start + 1, end);
  const indent = Math.min(
    ...body.filter((line) => line.trim() !== "").map((line) => line.search(/\S/)),
  );
  return body.map((line) => line.slice(indent)).join("\n");
}

function markerLines(lines: string[], marker: string): number[] {
  return lines.flatMap((line, index) => (line.trim() === marker ? [index] : []));
}
