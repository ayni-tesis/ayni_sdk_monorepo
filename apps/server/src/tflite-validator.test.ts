import { describe, expect, it } from "vitest";

import { computeSha256Hex, gateTfLiteBuffer, MIN_TFLITE_BYTES } from "./tflite-validator";

function tfliteBuffer(overrides?: {
  root?: number;
  soffset?: number;
  vsize?: number;
  inline?: number;
  identifier?: string;
  size?: number;
}): Uint8Array {
  const bytes = new Uint8Array(overrides?.size ?? 20);
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

describe("gateTfLiteBuffer", () => {
  it("accepts a minimal structurally plausible TFL3 buffer", () => {
    expect(gateTfLiteBuffer(tfliteBuffer())).toEqual({ ok: true });
  });

  it("rejects buffers below the FlatBuffers minimum", () => {
    expect(gateTfLiteBuffer(new Uint8Array(MIN_TFLITE_BYTES - 1))).toEqual({
      ok: false,
      reason: "size",
    });
  });

  it("rejects buffers over the policy maximum", () => {
    const bytes = tfliteBuffer();
    expect(gateTfLiteBuffer(bytes, bytes.length - 1)).toEqual({ ok: false, reason: "size" });
  });

  it("rejects gzip and zip containers with a dedicated reason", () => {
    const gzip = tfliteBuffer();
    gzip[0] = 0x1f;
    gzip[1] = 0x8b;
    expect(gateTfLiteBuffer(gzip)).toEqual({ ok: false, reason: "compressed" });

    const zip = tfliteBuffer();
    zip[0] = 0x50;
    zip[1] = 0x4b;
    expect(gateTfLiteBuffer(zip)).toEqual({ ok: false, reason: "compressed" });
  });

  it("accepts only the TFL3 identifier", () => {
    for (const identifier of ["TFL2", "TFLA", "tfl3"]) {
      expect(gateTfLiteBuffer(tfliteBuffer({ identifier }))).toEqual({
        ok: false,
        reason: "identifier",
      });
    }
  });

  it("rejects implausible root offsets", () => {
    for (const root of [4, 10, 20]) {
      expect(gateTfLiteBuffer(tfliteBuffer({ root }))).toEqual({
        ok: false,
        reason: "root-offset",
      });
    }
  });

  it("rejects implausible vtables", () => {
    for (const overrides of [
      { soffset: 20 },
      { vsize: 13 },
      { vsize: 100 },
      { inline: 2 },
      { inline: 100 },
    ]) {
      expect(gateTfLiteBuffer(tfliteBuffer(overrides))).toEqual({ ok: false, reason: "vtable" });
    }
  });

  it("rejects files whose root points beyond the old inspected prefix", () => {
    const bytes = new Uint8Array(128);
    const dv = new DataView(bytes.buffer);
    dv.setUint32(0, 68, true);
    bytes.set([0x54, 0x46, 0x4c, 0x33], 4);
    // bytes 68..71 (soffset) are zero -> vtable at 68 with vsize 0
    expect(gateTfLiteBuffer(bytes)).toEqual({ ok: false, reason: "vtable" });
  });

  it("rejects a root table that does not fit in the buffer", () => {
    expect(gateTfLiteBuffer(tfliteBuffer({ root: 16, size: 20 }))).toEqual({
      ok: false,
      reason: "vtable",
    });
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
