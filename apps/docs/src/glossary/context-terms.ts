export type ContextTerm = { term: string; definition: string; avoid: string[] };

/**
 * The terms of the `## Language` list in `CONTEXT.md`: each `**Term**:` line,
 * the definition below it and its `_Avoid_:` line. The glossary is checked
 * against them, so `CONTEXT.md` stays its only source (US-141).
 */
export function contextTerms(source: string): ContextTerm[] {
  const terms: ContextTerm[] = [];
  let current: { term: string; lines: string[] } | undefined;
  for (const line of source.split(/\r?\n/)) {
    const heading = /^\*\*(.+)\*\*:$/.exec(line);
    if (heading?.[1]) {
      if (current) throw new Error(`The term "${current.term}" has no _Avoid_ line.`);
      current = { term: heading[1], lines: [] };
    } else if (current && line.startsWith("_Avoid_:")) {
      terms.push({
        term: current.term,
        definition: current.lines.join(" "),
        avoid: splitOutsideParentheses(line.slice("_Avoid_:".length)),
      });
      current = undefined;
    } else if (current && line.trim() !== "") {
      current.lines.push(line.trim());
    }
  }
  if (current) throw new Error(`The term "${current.term}" has no _Avoid_ line.`);
  return terms;
}

/** Comma-separated items; a comma inside parentheses belongs to its item. */
function splitOutsideParentheses(list: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let item = "";
  for (const character of list) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      items.push(item.trim());
      item = "";
    } else {
      item += character;
    }
  }
  items.push(item.trim());
  return items.filter((entry) => entry !== "");
}
