import source from "../../../../packages/sdk_flutter/lib/src/ayni_sdk.dart?raw";

/** The source of `AyniSdk`, which `Instalación y configuración` documents (US-140). */
export const ayniSdkSource = source;

export type DartParameter = {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
};

/**
 * The named parameters of `className`'s unnamed constructor, in declaration
 * order. A `this.name` parameter takes the type of its field. Pages check
 * their parameter tables against this, so a table cannot drift from the code.
 */
export function constructorParameters(source: string, className: string): DartParameter[] {
  const opening = `${className}({`;
  const start = source.indexOf(opening);
  if (start === -1) throw new Error(`The source has no "${opening}" constructor.`);
  const listStart = start + opening.length;
  const listEnd = source.indexOf("})", listStart);
  if (listEnd === -1) throw new Error(`The "${className}" constructor never closes.`);
  // A top-level class closes with the first `}` at the start of a line.
  const classEnd = source.indexOf("\n}", listEnd);
  const classBody = source.slice(listEnd, classEnd === -1 ? undefined : classEnd);

  return splitTopLevel(source.slice(listStart, listEnd)).map((declaration) => {
    const required = declaration.startsWith("required ");
    const [signature = "", defaultValue] = declaration
      .replace(/^required\s+/, "")
      .split(/\s*=\s*(.*)/s);
    const field = /^this\.(\w+)$/.exec(signature);
    const name = field?.[1] ?? signature.slice(signature.search(/\w+$/));
    const type = field ? fieldType(classBody, name) : signature.slice(0, -name.length).trim();
    return defaultValue === undefined
      ? { name, type, required }
      : { name, type, required, defaultValue };
  });
}

/** The declared type of the `final` field `name`. */
function fieldType(classBody: string, name: string): string {
  const match = new RegExp(`^\\s*final\\s+(.+?)\\s+${name};`, "m").exec(classBody);
  if (!match?.[1]) throw new Error(`The source has no "${name}" field.`);
  return match[1];
}

/** The comma-separated entries of `list`, ignoring commas inside brackets. */
function splitTopLevel(list: string): string[] {
  const entries: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of list) {
    if ("(<[{".includes(character)) depth++;
    if (")>]}".includes(character)) depth--;
    if (character === "," && depth === 0) {
      entries.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  entries.push(current);
  return entries.map((entry) => entry.replace(/\s+/g, " ").trim()).filter(Boolean);
}
