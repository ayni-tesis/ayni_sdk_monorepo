import ts from "typescript";

/** An HTTP route: an upper-case method and an OpenAPI path (`{param}`, not `:param`). */
export type HttpRoute = { method: string; path: string };

const routeMethods = new Set(["get", "post", "put", "patch", "delete", "all"]);

function stringValue(node: ts.Node | undefined) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;
}

/** The methods and path of a route call: `get(path)` and the like, or `on(methods, path)`. */
function routeCall(helper: string, args: ts.NodeArray<ts.Expression>) {
  if (routeMethods.has(helper)) return { methods: [helper], path: stringValue(args[0]) };
  if (helper !== "on") return undefined;
  const methods = args[0];
  return {
    methods:
      methods && ts.isArrayLiteralExpression(methods)
        ? methods.elements.flatMap((element) => stringValue(element) ?? [])
        : [stringValue(methods) ?? ""],
    path: stringValue(args[1]),
  };
}

const operationMethods = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);

/** The `/sdk/*` operations an OpenAPI document describes. */
function documentedSdkRoutes(document: { paths?: Record<string, object> }): HttpRoute[] {
  return Object.entries(document.paths ?? {}).flatMap(([path, item]) =>
    path.startsWith("/sdk/")
      ? Object.keys(item)
          .filter((key) => operationMethods.has(key))
          .map((method) => ({ method: method.toUpperCase(), path }))
      : [],
  );
}

/**
 * Where the server's `/sdk/*` routes and the specification disagree: routes
 * the server declares that the specification does not describe, and
 * operations the specification describes that the server does not declare.
 */
export function sdkRouteDrift(
  serverRoutes: HttpRoute[],
  document: { paths?: Record<string, object> },
) {
  const key = ({ method, path }: HttpRoute) => `${method} ${path}`;
  const documented = documentedSdkRoutes(document);
  const documentedKeys = new Set(documented.map(key));
  const serverKeys = new Set(serverRoutes.map(key));
  return {
    undocumented: serverRoutes.filter((route) => !documentedKeys.has(key(route))),
    unimplemented: documented.filter((route) => !serverKeys.has(key(route))),
  };
}

/** A Hono path in OpenAPI form: `:param` (with an optional `{regex}`) becomes `{param}`. */
function toOpenApiPath(path: string) {
  return path.replace(/:(\w+)(\{[^}]*\})?/g, "{$1}");
}

/**
 * The `/sdk/*` routes a server source file declares with Hono's `app.get(...)`
 * and the other method helpers, `app.all(...)` (method `ALL`) or
 * `app.on(methods, ...)`. Paths must be string literals; a sub-app mounted
 * under `/sdk` with `app.route(...)` is not followed.
 */
export function sdkRoutesInSource(source: string): HttpRoute[] {
  const routes: HttpRoute[] = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const call = routeCall(node.expression.name.text, node.arguments);
      if (call?.path?.startsWith("/sdk/")) {
        const path = toOpenApiPath(call.path);
        routes.push(...call.methods.map((method) => ({ method: method.toUpperCase(), path })));
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(ts.createSourceFile("server.ts", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS));
  return routes;
}
