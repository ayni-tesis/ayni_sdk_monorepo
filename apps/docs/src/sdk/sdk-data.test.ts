import { describe, expect, it } from "vitest";
import { sdkLibraryFiles, sdkLibrarySource, sdkRequests, storagePathParts } from "./sdk-data";

describe("sdkRequests", () => {
  it("reads each request to the server with its path, headers and redirects", () => {
    const source = [
      "final request = await client.postUrl(serverUrl.resolve('/sdk/sync'));",
      "request.followRedirects = false;",
      "request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $_credential');",
      "final response = await request.close();",
      "final other = await client.getUrl(",
      "  serverUrl.resolve('/sdk/model-versions/$modelVersionId/manifest'),",
      ");",
      "final otherResponse = await other.close();",
    ].join("\n");

    expect(sdkRequests(source)).toEqual([
      {
        method: "POST",
        target: "/sdk/sync",
        headers: ["HttpHeaders.authorizationHeader"],
        sendsCredential: true,
        followsRedirects: false,
        sendsBody: false,
      },
      {
        method: "GET",
        target: "/sdk/model-versions/<modelVersionId>/manifest",
        headers: [],
        sendsCredential: false,
        followsRedirects: true,
        sendsBody: false,
      },
    ]);
  });

  it("names a request to another URL after the variable that holds it", () => {
    const source = "final request = await client.getUrl(manifest.downloadUrl);\nrequest.close();";

    expect(sdkRequests(source).map(({ target }) => target)).toEqual(["<downloadUrl>"]);
  });

  it("reads a request only up to its own close()", () => {
    const source = [
      "final request = await client.getUrl(manifest.downloadUrl);",
      "await sink?.close();",
      "request.headers.add('x-installation-id', installationId);",
      "request.headers.set('Authorization', 'Bearer $credential');",
      "await request.close();",
      "final later = await client.getUrl(serverUrl.resolve('/sdk/sync'));",
      "later.write(body);",
      "await later.close();",
    ].join("\n");

    expect(sdkRequests(source)).toEqual([
      expect.objectContaining({
        headers: ["'x-installation-id'", "'Authorization'"],
        sendsCredential: true,
        sendsBody: false,
      }),
      expect.objectContaining({ headers: [], sendsBody: true }),
    ]);
  });

  it("reads cascaded headers and the Content-Type a request declares (US-070)", () => {
    const source = [
      "final start = await _client.postUrl(serverUrl.resolve('/sdk/evidence'));",
      "start.headers",
      "  ..set(HttpHeaders.authorizationHeader, 'Bearer $_credential')",
      "  ..contentType = ContentType.json;",
      "start.write(jsonEncode(body));",
      "await start.close();",
      "final upload = await _client.putUrl(uploadUrl);",
      "upload.headers.contentType = ContentType('image', 'jpeg');",
      "upload.add(image);",
      "await upload.close();",
    ].join("\n");

    expect(sdkRequests(source)).toEqual([
      expect.objectContaining({
        method: "POST",
        target: "/sdk/evidence",
        headers: ["HttpHeaders.authorizationHeader", "HttpHeaders.contentTypeHeader"],
        sendsCredential: true,
        sendsBody: true,
      }),
      expect.objectContaining({
        method: "PUT",
        target: "<uploadUrl>",
        headers: ["HttpHeaders.contentTypeHeader"],
        sendsCredential: false,
        sendsBody: true,
      }),
    ]);
  });

  it("notices a credential sent without the Authorization header constant", () => {
    const source = [
      "final request = await client.getUrl(manifest.downloadUrl);",
      "_authorize(request, _credential);",
      "await request.close();",
    ].join("\n");

    expect(sdkRequests(source)[0]?.sendsCredential).toBe(true);
  });

  it("notices a request that sends a body", () => {
    const source = [
      "final request = await client.postUrl(serverUrl.resolve('/sdk/traces'));",
      "request.write(jsonEncode(trace));",
      "await request.close();",
    ].join("\n");

    expect(sdkRequests(source)[0]?.sendsBody).toBe(true);
  });

  it("fails on a network call it cannot describe", () => {
    const unreadable = [
      ["await client.openUrl('POST', url);", "openUrl("],
      ["await WebSocket.connect(url);", "WebSocket.connect("],
      ["await SecureSocket.startConnect(host, 443);", "SecureSocket.startConnect("],
      ["await RawDatagramSocket.bind(address, 0);", "RawDatagramSocket.bind("],
      ["await client.open('POST', host, 443, '/sdk/traces');", "open("],
      ["await client.post(host, 443, '/sdk/traces');", "post("],
      ["import 'package:http/http.dart' as http;", "package:http/"],
      ["final request = await client.getUrl(Uri.parse(url));", "getUrl(Uri.parse(url))"],
      ["await client.getUrl(url);", "getUrl( without a request variable"],
      ["final request = await client.getUrl(url);", "request.close()"],
    ];
    for (const [source, call] of unreadable) {
      expect(() => sdkRequests(source ?? ""), source).toThrow(
        `The SDK makes a network call this page test cannot read: ${call}`,
      );
    }
  });

  it("does not take a file opened in a mode for a network call", () => {
    expect(sdkRequests("lock = await File(lockPath).open(mode: FileMode.append);")).toEqual([]);
  });

  it("reads the requests of the SDK", () => {
    expect(
      sdkRequests(sdkLibrarySource()).map(({ method, target }) => `${method} ${target}`),
    ).toEqual(expect.arrayContaining(["POST /sdk/sync", "GET <downloadUrl>"]));
  });
});

describe("sdkLibrarySource", () => {
  it("reads the files an app runs, including conditional imports, but not the package tool", () => {
    const files = sdkLibraryFiles();

    expect(files).toEqual(
      expect.arrayContaining([
        "ayni_sdk.dart",
        "src/ayni_sdk.dart",
        "src/model_artifact_downloader.dart",
        "src/workflow_version_downloader.dart",
        "src/supported_platform_flutter.dart",
        "src/workflow_tflite_flutter.dart",
      ]),
    );
    expect(files).not.toContain("src/package_validator.dart");
  });

  it("leaves out comments", () => {
    expect(sdkLibrarySource()).not.toMatch(/^\s*\/\//m);
  });
});

describe("storagePathParts", () => {
  it("reads the fixed names and extensions of the paths the SDK builds", () => {
    const source = `
File('\${storageDirectory.path}\${Platform.pathSeparator}sync-inventory.json');
File('\${storageDirectory.path}\${Platform.pathSeparator}'
  'model-downloads\${Platform.pathSeparator}$modelVersionId.tflite');
File('\${temporaryArtifact.path}.verified');
final lockPath = '\${modelDirectory.path}/$versionId.lock';
File("\${storageDirectory.path}/evidence_queue.db");
File('$root/Telemetry');
import 'package:crypto/crypto.dart';
const names = ['ayni.config.json'];
`;

    expect(storagePathParts(source)).toEqual({
      names: ["sync-inventory.json", "model-downloads", "evidence_queue.db", "Telemetry"],
      extensions: [".json", ".tflite", ".verified", ".lock", ".db"],
    });
  });
});
