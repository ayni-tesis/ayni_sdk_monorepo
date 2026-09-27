import { describe, expect, it } from "vitest";
import { ayniSdkSource, constructorParameters } from "./dart-constructor";

const source = `
class Other {
  Other({required this.value});
  final int value;
}

class Client {
  Client({
    required this.url,
    required String secret,
    this.timeout = const Duration(seconds: 5),
    this.onEvent,
    Helper? helper,
  }) : _secret = secret,
       _helper = helper ?? Helper();

  final Uri url;
  final Duration timeout;

  /// Receives every event.
  final void Function(String message, int count)? onEvent;
  final String _secret;
  final Helper _helper;
}
`;

describe("constructorParameters", () => {
  it("reads each named parameter with its type, whether it is required and its default", () => {
    expect(constructorParameters(source, "Client")).toEqual([
      { name: "url", type: "Uri", required: true },
      { name: "secret", type: "String", required: true },
      {
        name: "timeout",
        type: "Duration",
        required: false,
        defaultValue: "const Duration(seconds: 5)",
      },
      { name: "onEvent", type: "void Function(String message, int count)?", required: false },
      { name: "helper", type: "Helper?", required: false },
    ]);
  });

  it("fails when the class has no named-parameter constructor", () => {
    expect(() => constructorParameters(source, "Missing")).toThrow(
      'The source has no "Missing({" constructor.',
    );
  });

  it("reads the constructor of AyniSdk from the SDK source", () => {
    const names = constructorParameters(ayniSdkSource, "AyniSdk").map(({ name }) => name);

    expect(names).toContain("serverUrl");
    expect(names).toContain("syncTimeout");
  });
});
