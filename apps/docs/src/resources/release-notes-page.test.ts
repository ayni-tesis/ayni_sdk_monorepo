import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import openapi from "../../../../packages/api/src/openapi.json";
import changelogSource from "../../../../packages/sdk_flutter/CHANGELOG.md?raw";
import pubspec from "../../../../packages/sdk_flutter/pubspec.yaml?raw";
import { validatorNodeFields, validatorSource } from "../reference/workflow-schema";
import { compareVersions, parseChangelog } from "./changelog";
import { compatibilityRows, nodeTypeSince, sdkCompatibility } from "./compatibility";

const page = readFileSync(
  join(import.meta.dirname, "..", "content", "docs", "recursos", "notas-de-version.mdx"),
  "utf8",
).replace(/\r\n/g, "\n");

const releases = parseChangelog(changelogSource);
const releasedVersions = releases.map((release) => release.version);

const pubspecVersion = /^version:\s*(\S+)/m.exec(pubspec)?.[1];

describe("Notas de versión y compatibilidad (US-148)", () => {
  it("has an entry for the version pubspec.yaml publishes, as the newest one", () => {
    expect(pubspecVersion).toBeDefined();
    expect(releases[0]?.version).toBe(pubspecVersion);
  });

  it("renders the notes and the table from CHANGELOG.md without a copy of them", () => {
    expect(page).toContain("<ReleaseNotes />");
    expect(page).toContain("## Compatibilidad\n\n<CompatibilityTable />");
    for (const version of releasedVersions) {
      expect(page).not.toContain(version);
    }
  });

  it("declares the compatibility of every version in CHANGELOG.md and nothing else", () => {
    expect(Object.keys(sdkCompatibility)).toEqual(releasedVersions);
    expect(() => compatibilityRows(releases)).not.toThrow();
  });

  it("never asks for a server newer than the HTTP API the server publishes", () => {
    for (const [version, { minimumServer }] of Object.entries(sdkCompatibility)) {
      expect(compareVersions(minimumServer, openapi.info.version), version).toBeLessThanOrEqual(0);
    }
  });

  it("dates every node type the SDK validator accepts from a released version", () => {
    expect(Object.keys(nodeTypeSince)).toEqual(Object.keys(validatorNodeFields(validatorSource)));
    for (const since of Object.values(nodeTypeSince)) {
      expect(releasedVersions).toContain(since);
    }
  });
});
