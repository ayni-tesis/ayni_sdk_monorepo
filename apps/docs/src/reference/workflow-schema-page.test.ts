import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ayniSdkSource from "../../../../packages/sdk_flutter/lib/src/ayni_sdk.dart?raw";
import { tableRows } from "../markdown-table";
import { nodeTypeSince } from "../resources/compatibility";
import { validationRejections, validatorNodeFields, validatorSource } from "./workflow-schema";

const docsRoot = join(import.meta.dirname, "..", "content", "docs");

/** A page under `content/docs`, with `\n` line endings. */
function read(file: string): string {
  return readFileSync(join(docsRoot, file), "utf8").replace(/\r\n/g, "\n");
}

const page = read("referencia/esquema-de-workflow.mdx");

/** The text of the `heading` section (`## …` or `### …`), up to the next heading of its level or above. */
function section(heading: string): string {
  const level = heading.slice(0, heading.indexOf(" "));
  const start = page.indexOf(`\n${heading}\n`);
  if (start === -1) throw new Error(`The page has no "${heading}" section.`);
  const next = [...page.slice(start + 1).matchAll(/\n(#{2,3}) /g)].find(
    (match) => (match[1] ?? "").length <= level.length,
  );
  return page.slice(start, next?.index === undefined ? undefined : start + 1 + next.index);
}

const nodeFields = validatorNodeFields(validatorSource);

/**
 * How the page names each reason the validator rejects a definition. A new
 * `WorkflowValidationStatus` fails the test until the page documents it.
 */
const ruleByRejection: Record<string, string> = {
  invalidSchema: "Esquema exacto",
  unsupportedSchemaVersion: "Versión de esquema compatible",
  unknownNodeType: "Tipos de nodo compatibles",
  undeclaredModelVersion: "Modelos declarados",
  missingNode: "Nodos existentes",
  cycle: "Grafo acíclico",
  incompatiblePort: "Puertos compatibles",
};

/** The `invalidWorkflow` messages of `SyncResourceResult`, with `$name` as `<nombre>`. */
const invalidWorkflowMessages = [
  ...ayniSdkSource.matchAll(
    /SyncResourceStatus\.invalidWorkflow(?:\s+when previousVersionRetained)?\s*=>\s*'([^']+)'/g,
  ),
].map(([, message]) => (message ?? "").replace("$name", "`<nombre>`"));

/** The `unsupportedWorkflowVersion` messages of `SyncResourceResult`. */
const unsupportedWorkflowMessages = [
  ...ayniSdkSource.matchAll(
    /SyncResourceStatus\.unsupportedWorkflowVersion(?:\s+when previousVersionRetained)?\s*=>\s*'([^']+)'/g,
  ),
].map(([, message]) => message ?? "");

describe("Esquema de workflow (US-145)", () => {
  it("describes the definition as { schemaVersion, nodes, connections } without the canvas layout", () => {
    const structure = section("## Estructura general");

    expect(structure).toContain("`{ schemaVersion, nodes, connections }`");
    expect(structure).toContain(
      ":::note\nLa disposición del lienzo no forma parte de la versión publicada.\n:::",
    );
  });

  it("lists every node type the SDK runs with its exact fields", () => {
    const rows = tableRows(section("## Tipos de nodo")).map((row) => row.slice(0, 2));

    expect(rows).toEqual(
      Object.entries(nodeFields).map(([type, fields]) => [
        `[\`${type}\`](#${type.replace(".", "")})`,
        fields.map((field) => `\`${field}\``).join(", "),
      ]),
    );
  });

  it("gives each node type the SDK version the compatibility table dates it from", () => {
    const since = tableRows(section("## Tipos de nodo")).map((row) => row[2] ?? "");

    expect(since).toEqual(Object.keys(nodeFields).map((type) => `\`${nodeTypeSince[type]}\``));
  });

  it("describes each field of each node type", () => {
    for (const [type, fields] of Object.entries(nodeFields)) {
      const rows = tableRows(section(`### \`${type}\``));
      const documentedFields = rows
        .map((row) => row[0])
        .filter((field) => type !== "output" || field !== "`sources`");

      expect(documentedFields, type).toEqual(fields.map((field) => `\`${field}\``));
      if (type === "output") {
        expect(rows.find((row) => row[0] === "`sources`")?.[2]).toContain("esquema 2");
      }
      expect(rows.filter((row) => (row[2] ?? "").length === 0).map((row) => row[0])).toEqual([]);
    }
  });

  it("explains the connection format, the compatible ports and the acyclic rule", () => {
    const connections = section("## Conexiones");

    for (const field of ["sourceNodeId", "sourcePort", "targetNodeId", "targetPort"]) {
      expect(connections).toContain(`\`${field}\``);
    }
    expect(connections).toContain("### Puertos compatibles");
    expect(connections).toContain("### Grafo acíclico");
  });

  it("documents one rule per reason the SDK rejects a definition", () => {
    expect(Object.keys(ruleByRejection)).toEqual(validationRejections(validatorSource));

    const rules = tableRows(section("## Reglas de validación")).map((row) => row[0]);

    expect(rules).toEqual(Object.values(ruleByRejection));
  });

  it("gives the result and the messages the app receives for a rejected definition", () => {
    const rules = section("## Reglas de validación");

    expect(rules).toContain("`SyncResourceStatus.invalidWorkflow`");
    expect(rules).toContain("`SyncResourceStatus.unsupportedWorkflowVersion`");
    expect(invalidWorkflowMessages).toHaveLength(2);
    for (const message of invalidWorkflowMessages) {
      expect(rules).toContain(message);
    }
    expect(unsupportedWorkflowMessages).toHaveLength(2);
    for (const message of unsupportedWorkflowMessages) {
      expect(rules).toContain(message);
    }
  });

  it("explains what happens with a node type the SDK version does not support", () => {
    const unsupported = section("### Tipos de nodo sin soporte");

    expect(unsupported).toContain("se conserva la versión anterior");
    expect(unsupported).toContain(
      "[Notas de versión y compatibilidad](/recursos/notas-de-version/)",
    );
  });

  it("shows the complete example from the SDK package with a copy button", () => {
    const example = section("## Ejemplo completo");

    expect(page).toContain(
      'import { workflowDefinition } from "../../../examples/workflow-definition";',
    );
    expect(example).toContain('<Code code={workflowDefinition} lang="json"');
  });
});
