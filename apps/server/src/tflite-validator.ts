const TFL3_BYTES = [0x54, 0x46, 0x4c, 0x33] as const;

export const MIN_TFLITE_BYTES = 12;
export const DEFAULT_MAX_TFLITE_BYTES = 256 * 1024 * 1024;

export type TfliteGateFailure = "size" | "compressed" | "identifier" | "root-offset" | "vtable";

export type TfliteGateResult = { ok: true } | { ok: false; reason: TfliteGateFailure };

/**
 * Verificacion superficial (sin esquema) de un buffer .tflite completo,
 * replicando las invariantes que el Verifier de FlatBuffers exige a la raiz
 * y su vtable (ver docs/research/tflite-flatbuffers-validation.md). Recibe
 * el buffer integro: todo offset declarado debe caer dentro del propio
 * buffer, sin ramas de aceptacion anticipada.
 */
export function gateTfLiteBuffer(
  buffer: Uint8Array,
  maxBytes: number = DEFAULT_MAX_TFLITE_BYTES,
): TfliteGateResult {
  const totalSize = buffer.length;
  if (totalSize < MIN_TFLITE_BYTES || totalSize > maxBytes) return { ok: false, reason: "size" };

  if (
    (buffer[0] === 0x1f && (buffer[1] === 0x8b || buffer[1] === 0xa0)) ||
    (buffer[0] === 0x50 && buffer[1] === 0x4b)
  ) {
    return { ok: false, reason: "compressed" };
  }

  if (
    buffer[4] !== TFL3_BYTES[0] ||
    buffer[5] !== TFL3_BYTES[1] ||
    buffer[6] !== TFL3_BYTES[2] ||
    buffer[7] !== TFL3_BYTES[3]
  ) {
    return { ok: false, reason: "identifier" };
  }

  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const root = dv.getUint32(0, true);
  if (root < 8 || root % 4 !== 0 || root + 4 > totalSize) {
    return { ok: false, reason: "root-offset" };
  }

  const vtable = root - dv.getInt32(root, true);
  if (vtable < 0 || vtable + 4 > totalSize) return { ok: false, reason: "vtable" };

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
