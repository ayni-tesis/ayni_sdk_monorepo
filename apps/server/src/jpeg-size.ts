/**
 * The width and height of a JPEG, read from its first frame header (SOF0 to
 * SOF15, except the DHT, JPG and DAC markers that share the range), or `null`
 * when `bytes` is not a JPEG or ends before that header. The server uses it to
 * check that an uploaded evidence image is the JPEG its metadata describes.
 */
export function readJpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1] ?? 0;
    // Fill bytes before a marker.
    if (marker === 0xff) {
      offset++;
      continue;
    }
    // Markers without a length: TEM and RST0 to RST7.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // Start of scan or end of image before any frame header.
    if (marker === 0xda || marker === 0xd9) return null;
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    if (length < 2) return null;
    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader) {
      // Precision, height, width and the component count, all inside the
      // segment the header declares and the bytes received.
      if (length < 8 || offset + 2 + length > bytes.length) return null;
      const height = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
      const width = ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += 2 + length;
  }
  return null;
}
