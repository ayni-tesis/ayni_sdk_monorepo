import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

// `Recursos → Datos y privacidad` (US-147) is checked against what the SDK's
// code sends and stores. Only tests import this module.

const sdkLibrary = join(import.meta.dirname, "..", "..", "..", "..", "packages/sdk_flutter/lib");

/** `source` without its comment lines, so doc examples are not read as code. */
function withoutComments(source: string): string {
  return source.replace(/\r\n/g, "\n").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * The Dart files an app runs: `lib/ayni_sdk.dart` and every file it reaches
 * through relative imports and exports, conditional ones included. Tools such
 * as `bin/package.dart`'s package validator stay out.
 */
export function sdkLibraryFiles(): string[] {
  const files = new Set<string>();
  const visit = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    const source = withoutComments(readFileSync(join(sdkLibrary, file), "utf8"));
    const directives = source.match(/\b(?:import|export)\s[^;]*;/g) ?? [];
    for (const directive of directives) {
      for (const [, uri = ""] of directive.matchAll(/'([^':]+\.dart)'/g)) {
        visit(posix.normalize(posix.join(posix.dirname(file), uri)));
      }
    }
  };
  visit("ayni_sdk.dart");
  return [...files].sort();
}

/** The files of `sdkLibraryFiles`, joined, without their comment lines. */
export function sdkLibrarySource(): string {
  return sdkLibraryFiles()
    .map((file) => withoutComments(readFileSync(join(sdkLibrary, file), "utf8")))
    .join("\n");
}

export type SdkRequest = {
  method: string;
  /** The server path, such as `/sdk/sync`, or `<variable>` for any other URL. */
  target: string;
  /**
   * The first argument of each `headers.set` or `headers.add` call, as
   * written (cascades too), and `HttpHeaders.contentTypeHeader` for each
   * `headers.contentType` it assigns.
   */
  headers: string[];
  sendsCredential: boolean;
  followsRedirects: boolean;
  sendsBody: boolean;
};

/** The text of the call whose `(` is at `open`, without its parentheses. */
function argument(source: string, open: number): string {
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === "(") depth++;
    if (source[index] === ")" && --depth === 0) return source.slice(open + 1, index).trim();
  }
  throw new Error("Unbalanced parentheses in the SDK source.");
}

/**
 * The headers `request` gives the request `name`: the first argument of each
 * `set` or `add` of a `name.headers` statement (cascades too), and
 * `HttpHeaders.contentTypeHeader` for each `contentType` it assigns.
 */
function requestHeaders(request: string, name: string): string[] {
  return [...request.matchAll(new RegExp(`\\b${name}\\.headers\\b[^;]*;`, "g"))].flatMap(
    ([statement]) =>
      [...statement.matchAll(/\.(?:set|add)\(\s*([^,]+),|\.contentType\s*=/g)].map(
        ([call, header = ""]) =>
          call.includes("contentType") ? "HttpHeaders.contentTypeHeader" : header.trim(),
      ),
  );
}

function unreadable(call: string): Error {
  return new Error(`The SDK makes a network call this page test cannot read: ${call}`);
}

/**
 * Network calls other than `getUrl`, `postUrl` and the like: sockets,
 * `openUrl`, `HttpClient`'s host-and-port methods and HTTP packages.
 */
const otherNetworkCalls = [
  /\b(?:\w+\.)?((?:Raw)?(?:Secure)?(?:Datagram)?(?:Server)?Socket\.(?:connect|startConnect|bind)|WebSocket\.connect|openUrl)\(/,
  /\b\w+\.((?:open|get|post|put|patch|delete|head)\()(?:[^(),]+,){2,}/,
  /\bimport\s+['"](package:(?:http|dio|web_socket_channel|grpc|socket_io_client)\/)/,
];

/**
 * Each HTTP request in `source`, in source order: from its `getUrl` or
 * `postUrl` call up to the `close()` of the same request, which sends it. A
 * network call this cannot describe fails, so a new kind of request cannot go
 * unnoticed.
 */
export function sdkRequests(source: string): SdkRequest[] {
  const code = withoutComments(source);
  for (const pattern of otherNetworkCalls) {
    const call = pattern.exec(code)?.[1];
    if (call) throw unreadable(call.endsWith("(") || call.endsWith("/") ? call : `${call}(`);
  }

  return [...code.matchAll(/\.(get|post|put|patch|delete|head)Url\(/g)].map((match) => {
    const [call, method = ""] = match;
    const open = match.index + call.length - 1;
    const url = argument(code, open).replace(/,$/, "").trim();
    const serverPath = /^serverUrl\.resolve\(\s*'([^']+)'\s*,?\s*\)$/.exec(url)?.[1];
    const variable = /^[\w.]+$/.test(url) ? url.split(".").at(-1) : undefined;
    if (serverPath === undefined && variable === undefined) {
      throw unreadable(`${method}Url(${url})`);
    }
    const name = /(\w+)\s*=\s*await\s+\w+(?:\.\w+)*$/.exec(code.slice(0, match.index))?.[1];
    if (!name) throw unreadable(`${method}Url( without a request variable`);
    const close = new RegExp(`\\b${name}\\.close\\(\\)`).exec(code.slice(open));
    if (!close) throw unreadable(`${name}.close()`);
    const request = code.slice(open, open + close.index);
    return {
      method: method.toUpperCase(),
      target: serverPath?.replace(/\$\{?(\w+)\}?/g, "<$1>") ?? `<${variable}>`,
      headers: requestHeaders(request, name),
      sendsCredential:
        /HttpHeaders\.authorizationHeader|['"]authorization['"]|\b_?credential\b/i.test(request),
      followsRedirects: !new RegExp(`\\b${name}\\.followRedirects = false;`).test(request),
      sendsBody: new RegExp(`\\b${name}\\.(?:write|writeln|writeAll|add|addStream)\\(`).test(
        request,
      ),
    };
  });
}

/**
 * The fixed file and directory names, and the file extensions, of the paths
 * `source` builds from a `.path`, `Platform.pathSeparator` or a `$variable/`
 * prefix, in order of first appearance. A path built another way, such as
 * with `package:path`, is not read.
 */
export function storagePathParts(source: string): { names: string[]; extensions: string[] } {
  const names = new Set<string>();
  const extensions = new Set<string>();
  for (const [, , literal = ""] of withoutComments(source).matchAll(/(['"])([^'"\n]*)\1/g)) {
    if (!/\.path\}|Platform\.pathSeparator\}|^\$\{?\w+\}?\//.test(literal)) continue;
    const fixedParts = literal.split(/\$\{[^}]*\}|\$\w+/);
    for (const part of fixedParts) {
      const name = part.replace(/^\/|\/$/g, "");
      if (/^[A-Za-z][\w.-]*$/.test(name)) names.add(name);
    }
    const extension = /\.\w+$/.exec(fixedParts.at(-1) ?? "")?.[0];
    if (extension) extensions.add(extension);
  }
  return { names: [...names], extensions: [...extensions] };
}
