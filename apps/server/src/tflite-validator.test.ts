import { describe, expect, it } from "vitest";

import { computeSha256Hex, gateTfLiteHead, MIN_TFLITE_BYTES } from "./tflite-validator";

function tfliteHead(overrides?: {
  root?: number;
  soffset?: number;
  vsize?: number;
  inline?: number;
  identifier?: string;
}): Uint8Array {
  const bytes = new Uint8Array(20);
  const dv = new DataView(bytes.buffer);
  dv.setUint32(0, overrides?.root ?? 12, true);
  bytes.set(
    (overrides?.identifier ?? "TFL3").split("").map((character) => character.charCodeAt(0)),
    4,
  );
  dv.setUint16(8, overrides?.vsize ?? 12, true);
  dv.setUint16(10, overrides?.inline ?? 8, true);
  dv.setInt32(12, overrides?.soffset ?? 4, true);
  return bytes;
}

describe("gateTfLiteHead", () => {
  it("accepts a minimal structurally plausible TFL3 buffer", () => {
    const head = tfliteHead();
    expect(gateTfLiteHead(head, head.length)).toEqual({ ok: true });
  });

  it("rejects buffers below the FlatBuffers minimum", () => {
    const head = new Uint8Array(MIN_TFLITE_BYTES - 1);
    expect(gateTfLiteHead(head, head.length)).toEqual({ ok: false, reason: "size" });
  });

  it("rejects buffers over the policy maximum", () => {
    const head = tfliteHead();
    expect(gateTfLiteHead(head, head.length, head.length - 1)).toEqual({
      ok: false,
      reason: "size",
    });
  });

  it("rejects an unreadably short head", () => {
    expect(gateTfLiteHead(new Uint8Array(4), 100)).toEqual({ ok: false, reason: "size" });
  });

  it("rejects gzip and zip containers with a dedicated reason", () => {
    const gzip = tfliteHead();
    gzip[0] = 0x1f;
    gzip[1] = 0x8b;
    expect(gateTfLiteHead(gzip, gzip.length)).toEqual({ ok: false, reason: "compressed" });

    const zip = tfliteHead();
    zip[0] = 0x50;
    zip[1] = 0x4b;
    expect(gateTfLiteHead(zip, zip.length)).toEqual({ ok: false, reason: "compressed" });
  });

  it("accepts only the TFL3 identifier", () => {
    for (const identifier of ["TFL2", "TFLA", "tfl3"]) {
      expect(gateTfLiteHead(tfliteHead({ identifier }), 20)).toEqual({
        ok: false,
        reason: "identifier",
      });
    }
  });

  it("rejects implausible root offsets", () => {
    expect(gateTfLiteHead(tfliteHead({ root: 4 }), 20)).toEqual({
      ok: false,
      reason: "root-offset",
    });
    expect(gateTfLiteHead(tfliteHead({ root: 10 }), 20)).toEqual({
      ok: false,
      reason: "root-offset",
    });
    expect(gateTfLiteHead(tfliteHead({ root: 20 }), 20)).toEqual({
      ok: false,
      reason: "root-offset",
    });
  });

  it("rejects implausible vtables", () => {
    expect(gateTfLiteHead(tfliteHead({ soffset: 20 }), 20)).toEqual({
      ok: false,
      reason: "vtable",
    });
    expect(gateTfLiteHead(tfliteHead({ vsize: 13 }), 20)).toEqual({
      ok: false,
      reason: "vtable",
    });
    expect(gateTfLiteHead(tfliteHead({ vsize: 100 }), 20)).toEqual({
      ok: false,
      reason: "vtable",
    });
    expect(gateTfLiteHead(tfliteHead({ inline: 2 }), 20)).toEqual({
      ok: false,
      reason: "vtable",
    });
    expect(gateTfLiteHead(tfliteHead({ inline: 100 }), 20)).toEqual({
      ok: false,
      reason: "vtable",
    });
  });

  it("passes when the head is too short to reach the vtable checks", () => {
    const head = tfliteHead().subarray(0, 8);
    expect(gateTfLiteHead(head, 20)).toEqual({ ok: true });
  });
});

describe("computeSha256Hex", () => {
  it("matches the known digest of the empty input", async () => {
    await expect(computeSha256Hex(new Uint8Array(0))).resolves.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("matches the known digest of ASCII 'abc'", async () => {
    await expect(computeSha256Hex(new Uint8Array([0x61, 0x62, 0x63]))).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
