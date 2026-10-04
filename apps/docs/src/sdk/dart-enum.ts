/**
 * The values of the Dart enum `name` declared in `source`, in declaration
 * order. Page tests compare the states they document with these values, so a
 * new value fails them until its page describes it.
 */
export function dartEnumValues(source: string, name: string): string[] {
  const match = new RegExp(`\\benum ${name} \\{([\\s\\S]*?)\\n\\}`).exec(
    source.replace(/\r\n/g, "\n"),
  );
  if (!match?.[1]) throw new Error(`The source has no ${name} enum.`);
  // An enhanced enum ends its values with `;`, and a value may take arguments.
  const values = match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("//"))
    .join("")
    .split(";")[0];
  return (values ?? "")
    .replace(/\([^)]*\)/g, "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
