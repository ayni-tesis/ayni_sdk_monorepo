import { describe, expect, it } from "vitest";
import ayniSdkSource from "../../../../packages/sdk_flutter/lib/src/ayni_sdk.dart?raw";
import { syncResourceMessages } from "./sync-messages";

const getter = `
class SyncResourceResult {
  final String? name;

  /// A Spanish message.
  String? get message =>
      status == SyncResourceStatus.invalidRemoteResource && remoteHashConflict
      ? 'Conflicto.'
      : switch (status) {
          SyncResourceStatus.invalidRemoteResource =>
            'No es válida.',
          SyncResourceStatus.invalidWorkflow when previousVersionRetained =>
            'Se mantuvo $name.',
          SyncResourceStatus.invalidWorkflow =>
            'No se instaló $name: $dependencyName.',
          _ => null,
        };
}
`;

describe("syncResourceMessages", () => {
  it("reads each case of the message getter with its condition", () => {
    expect(syncResourceMessages(getter)).toEqual([
      { status: "invalidRemoteResource", remoteHashConflict: true, message: "Conflicto." },
      { status: "invalidRemoteResource", message: "No es válida." },
      { status: "invalidWorkflow", previousVersionRetained: true, message: "Se mantuvo $name." },
      {
        status: "invalidWorkflow",
        previousVersionRetained: false,
        message: "No se instaló $name: $dependencyName.",
      },
    ]);
  });

  it("reads the getter across Windows line endings", () => {
    expect(syncResourceMessages(getter.replace(/\n/g, "\r\n"))).toHaveLength(4);
  });

  it("fails when the source has no message getter", () => {
    expect(() => syncResourceMessages("class Other {}")).toThrow(
      "The source has no SyncResourceResult.message getter.",
    );
  });

  it("reads every message of the SDK, with and without the previous version", () => {
    const messages = syncResourceMessages(ayniSdkSource);

    expect(messages.map(({ status }) => status)).toEqual([
      "invalidRemoteResource",
      "invalidRemoteResource",
      "invalidWorkflow",
      "invalidWorkflow",
      "installationFailed",
      "installationFailed",
      "dependencyFailed",
      "dependencyFailed",
      "workflowUnavailable",
      "workflowUnavailable",
    ]);
    expect(messages[2]).toEqual({
      status: "invalidWorkflow",
      previousVersionRetained: true,
      message: "La actualización de $name no es compatible. Se mantuvo la última versión válida.",
    });
  });
});
