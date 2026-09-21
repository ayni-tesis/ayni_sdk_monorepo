const TFL3_BYTES = [0x54, 0x46, 0x4c, 0x33] as const;

export const MIN_TFLITE_BYTES = 12;
export const TFLITE_HEAD_BYTES = 64;
export const DEFAULT_MAX_TFLITE_BYTES = 256 * 1024 * 1024;

export type TfliteGateFailure = "size" | "compressed" | "identifier" | "root-offset" | "vtable";

export type TfliteGateResult = { ok: true } | { ok: false; reason: TfliteGateFailure };

export function gateTfLiteHead(
  head: Uint8Array,
  totalSize: number,
  maxBytes: number = DEFAULT_MAX_TFLITE_BYTES,
): TfliteGateResult {
  if (totalSize < MIN_TFLITE_BYTES || totalSize > maxBytes) return { ok: false, reason: "size" };
  if (head.length < 8) return { ok: false, reason: "size" };

  if (
    (head[0] === 0x1f && (head[1] === 0x8b || head[1] === 0xa0)) ||
    (head[0] === 0x50 && head[1] === 0x4b)
  ) {
    return { ok: false, reason: "compressed" };
  }

  if (head[4] !== TFL3_BYTES[0] || head[5] !== TFL3_BYTES[1] || head[6] !== TFL3_BYTES[2]) {
    return { ok: false, reason: "identifier" };
  }
  if (head[7] !== TFL3_BYTES[3]) return { ok: false, reason: "identifier" };

  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);

  const root = dv.getUint32(0, true);
  if (root < 8 || root % 4 !== 0 || root + 4 > totalSize) {
    return { ok: false, reason: "root-offset" };
  }

  if (root + 8 > head.length) return { ok: true };

  const vtable = root - dv.getInt32(root, true);
  if (vtable < 0 || vtable + 4 > totalSize) return { ok: false, reason: "vtable" };

  if (vtable + 4 > head.length) return { ok: true };

  const vsize = dv.getUint16(vtable, true);
  const inlineSize = dv.getUint16(vtable + 2, true);
  if (vsize < 4 || (vsize & 1) !== 0 || vtable + vsize > totalSize) {
    return { ok: false, reason: "vtable" };
  }
  if (inlineSize < 4 || root + inlineSize > totalSize) return { ok: false, reason: "vtable" };

  return { ok: true };
}

export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
