import { describe, expect, it } from "vitest";
import { readJpegSize } from "./jpeg-size";

/** A JPEG reduced to the markers the reader walks: SOI, APP0, a frame header and SOS. */
function jpeg(width: number, height: number, frameMarker = 0xc0) {
  return new Uint8Array([
    0xff,
    0xd8,
    // APP0 (JFIF) with a 16-byte segment.
    0xff,
    0xe0,
    0x00,
    0x10,
    ...new Array(14).fill(0),
    // Start of frame: length, precision, height, width, components.
    0xff,
    frameMarker,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
    ...new Array(9).fill(0),
    // Start of scan.
    0xff,
    0xda,
    0x00,
    0x02,
  ]);
}

describe("readJpegSize", () => {
  it("reads the width and height of a baseline JPEG", () => {
    expect(readJpegSize(jpeg(640, 480))).toEqual({ width: 640, height: 480 });
  });

  it("reads them from a progressive frame header too", () => {
    expect(readJpegSize(jpeg(4096, 3072, 0xc2))).toEqual({ width: 4096, height: 3072 });
  });

  it.each([
    ["a PNG", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["an empty file", new Uint8Array()],
    ["a JPEG cut before its frame header", jpeg(640, 480).slice(0, 12)],
    ["a JPEG without a frame header", new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02])],
  ])("answers null for %s", (_, bytes) => {
    expect(readJpegSize(bytes)).toBeNull();
  });
});
