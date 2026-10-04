import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { sdkTraceSchema } from "./sdk-trace";

/**
 * The Flutter SDK keeps only the trace fields it may send before it saves or
 * sends a trace (US-073, `lib/src/trace_payload.dart`). A field the server
 * schema gains and the SDK does not list would be silently dropped, and a
 * field the SDK lists that the schema lacks would get every trace rejected,
 * so both must describe the same shape.
 */
const allowlistSource = readFileSync(
  join(import.meta.dirname, "../../sdk_flutter/lib/src/trace_payload.dart"),
  "utf8",
).replace(/\r\n/g, "\n");

type Shape =
  | "string"
  | "number"
  | "boolean"
  | { object: Record<string, Shape> }
  | { array: Shape }
  | { record: Shape }
  | { union: Record<string, Shape> };

type JsonSchema = {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: JsonSchema | boolean;
  items?: JsonSchema;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
};

/** The options of a union, with nested unions flattened. */
function unionOptions(schema: JsonSchema): JsonSchema[] {
  const options = schema.oneOf ?? schema.anyOf;
  return options ? options.flatMap(unionOptions) : [schema];
}

/** The shape `schema` accepts: field names, nesting and JSON types. */
function schemaShape(schema: JsonSchema): Shape {
  if (schema.oneOf || schema.anyOf) {
    return {
      union: Object.fromEntries(
        unionOptions(schema).map((option) => [
          String(option.properties?.type?.const),
          schemaShape(option),
        ]),
      ),
    };
  }
  switch (schema.type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return { array: schemaShape(schema.items ?? {}) };
    case "object":
      if (schema.properties) {
        return {
          object: Object.fromEntries(
            Object.entries(schema.properties).map(([name, field]) => [name, schemaShape(field)]),
          ),
        };
      }
      if (typeof schema.additionalProperties === "object") {
        return { record: schemaShape(schema.additionalProperties) };
      }
  }
  throw new Error(`Unexpected schema: ${JSON.stringify(schema)}`);
}

/** The body lines of each top-level `_trace…` map or set of the allowlist. */
function declarations(source: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const [, name, body] of source.matchAll(
    /^(?:const|final)(?: Map<[^=]*>)? (_trace\w+) = \{\n([\s\S]*?)\n\};/gm,
  )) {
    found.set(
      name ?? "",
      (body ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    );
  }
  return found;
}

const allowlist = declarations(allowlistSource);

function lines(name: string): string[] {
  const body = allowlist.get(name);
  if (!body) throw new Error(`trace_payload.dart has no ${name} declaration.`);
  return body;
}

/** The `'field': rule` entries of the map `name`. */
function entries(name: string): [string, string][] {
  return lines(name).flatMap((line) => {
    const entry = /^'(\w+)': (.+),$/.exec(line);
    return entry ? [[entry[1] ?? "", entry[2] ?? ""] as [string, string]] : [];
  });
}

/** The function each typed-output rule applies, by rule name. */
const typedRules = new Map(
  [
    ...allowlistSource.matchAll(
      /Object\? (_trace\w+)\(Object\? value\) =>\s*_typed\(value, (_trace\w+)\);/g,
    ),
  ].map(([, rule, types]) => [rule ?? "", types ?? ""]),
);

function unionShape(types: string): Shape {
  const options: Record<string, Shape> = {};
  for (const line of lines(types)) {
    const spread = /^\.\.\.(_trace\w+),$/.exec(line);
    const shape = spread ? unionShape(spread[1] ?? "") : null;
    if (shape && typeof shape === "object" && "union" in shape) Object.assign(options, shape.union);
  }
  for (const [type, fields] of entries(types)) options[type] = objectShape(fields);
  return { union: options };
}

function objectShape(name: string): Shape {
  return {
    object: Object.fromEntries(entries(name).map(([field, rule]) => [field, ruleShape(rule)])),
  };
}

/** The shape a Dart rule such as `_list(_object(_traceNodeFields))` keeps. */
function ruleShape(rule: string): Shape {
  const call = /^(_object|_list|_record)\((.+)\)$/.exec(rule);
  if (call) {
    const [, combinator, argument = ""] = call;
    if (combinator === "_object") return objectShape(argument);
    return combinator === "_list"
      ? { array: ruleShape(argument) }
      : { record: ruleShape(argument) };
  }
  if (rule === "_string" || rule === "_traceClientReportedField") return "string";
  if (rule === "_int" || rule === "_number") return "number";
  if (rule === "_bool") return "boolean";
  const types = typedRules.get(rule);
  if (types) return unionShape(types);
  throw new Error(`Unknown rule in trace_payload.dart: ${rule}`);
}

const jsonSchema = z.toJSONSchema(sdkTraceSchema, { unrepresentable: "any" }) as JsonSchema;

describe("the SDK's trace allowlist (US-073)", () => {
  it("keeps exactly the fields, nesting and types of sdkTraceSchema", () => {
    expect(objectShape("_traceFields")).toEqual(schemaShape(jsonSchema));
  });

  it("keeps exactly the clientReportedFields names the schema accepts", () => {
    const names = lines("_traceClientReportedFieldNames").map((line) =>
      line.replace(/^'(\w+)',$/, "$1"),
    );

    expect(names.sort()).toEqual(
      [...((jsonSchema.properties?.clientReportedFields?.items?.enum ?? []) as string[])].sort(),
    );
  });
});
