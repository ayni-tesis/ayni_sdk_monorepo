import ts from "typescript";
import serverSource from "../../../../apps/server/src/workflow-store.ts?raw";
import dartSource from "../../../../packages/sdk_flutter/lib/src/workflow_definition_validator.dart?raw";

// The sources `Referencia → Esquema de workflow` is checked against (US-145).
// Only tests import this module, so the site's build never bundles the
// TypeScript compiler.

/** The source of `WorkflowDefinitionValidator`, the rules the SDK applies. */
export const validatorSource = dartSource;

/** The source of the server's `WorkflowNode`, the nodes a version publishes. */
export const serverWorkflowStoreSource = serverSource;

/**
 * The exact fields of each node type, read from the validator's
 * `_nodeFields` map in declaration order.
 */
export function validatorNodeFields(source: string): Record<string, string[]> {
  const opening = "static const _nodeFields = {";
  const start = source.indexOf(opening);
  if (start === -1) throw new Error("The validator has no _nodeFields map.");
  const end = source.indexOf("\n  };", start);
  const body = source.slice(start + opening.length, end === -1 ? undefined : end);
  return Object.fromEntries(
    [...body.matchAll(/'([^']+)':\s*\{([^}]*)\}/g)].map(([, type, fields]) => [
      type,
      [...(fields ?? "").matchAll(/'([^']+)'/g)].map(([, field]) => field ?? ""),
    ]),
  );
}

/**
 * The fields of each member of the server's `WorkflowNode` union, keyed by
 * its `type` literal, in declaration order.
 */
export function serverNodeFields(source: string): Record<string, string[]> {
  const file = ts.createSourceFile("workflow-store.ts", source, ts.ScriptTarget.Latest);
  const alias = file.statements.find(
    (statement): statement is ts.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(statement) && statement.name.text === "WorkflowNode",
  );
  if (!alias || !ts.isUnionTypeNode(alias.type)) {
    throw new Error("The server has no WorkflowNode union.");
  }
  return Object.fromEntries(
    alias.type.types.filter(ts.isTypeLiteralNode).map((member) => {
      const properties = member.members.filter(ts.isPropertySignature);
      const type = properties.find((property) => property.name.getText(file) === "type")?.type;
      if (!type || !ts.isLiteralTypeNode(type) || !ts.isStringLiteral(type.literal)) {
        throw new Error("A WorkflowNode member has no string literal type.");
      }
      return [type.literal.text, properties.map((property) => property.name.getText(file))];
    }),
  );
}

/**
 * The reasons the validator can reject a definition: every
 * `WorkflowValidationStatus` value except `valid`, in declaration order.
 */
export function validationRejections(source: string): string[] {
  const match = /enum WorkflowValidationStatus \{([\s\S]*?)\n\}/.exec(source);
  if (!match?.[1]) throw new Error("The validator has no WorkflowValidationStatus enum.");
  const values = match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("//"))
    .join("")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values.filter((value) => value !== "valid");
}
