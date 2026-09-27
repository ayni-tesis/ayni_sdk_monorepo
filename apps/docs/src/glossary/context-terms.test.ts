import { describe, expect, it } from "vitest";
import { contextTerms } from "./context-terms";

const source = [
  "# Ayni Domain Context",
  "",
  "## Language",
  "",
  "**Workspace**:",
  "The tenant boundary that isolates applications.",
  "_Avoid_: Team, tenant",
  "",
  "**Draft Revision**:",
  "A counter on a Workflow's draft.",
  "Published versions never carry it.",
  "_Avoid_: Draft version (a published Workflow version is a different thing), ETag",
  "",
].join("\r\n");

describe("contextTerms", () => {
  it("reads each term with its definition and the terms it avoids", () => {
    expect(contextTerms(source)).toEqual([
      {
        term: "Workspace",
        definition: "The tenant boundary that isolates applications.",
        avoid: ["Team", "tenant"],
      },
      {
        term: "Draft Revision",
        definition: "A counter on a Workflow's draft. Published versions never carry it.",
        avoid: ["Draft version (a published Workflow version is a different thing)", "ETag"],
      },
    ]);
  });

  it("reads only the Language section", () => {
    const withOtherSection = [
      source,
      "## Example dialogue",
      "",
      "**Note**:",
      "Not a term.",
      "_Avoid_: x",
    ].join("\r\n");

    expect(contextTerms(withOtherSection).map(({ term }) => term)).toEqual([
      "Workspace",
      "Draft Revision",
    ]);
  });

  it("rejects a term without an _Avoid_ line", () => {
    expect(() => contextTerms("## Language\n\n**Workspace**:\nThe tenant boundary.\n")).toThrow(
      'The term "Workspace" has no _Avoid_ line.',
    );
  });
});
