import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("R2 upload URL", () => {
  it("does not sign unsupported checksum parameters into a PutObject URL", async () => {
    vi.stubEnv("R2_ACCOUNT_ID", "account");
    vi.stubEnv("R2_ACCESS_KEY_ID", "test-access");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-secret");
    vi.stubEnv("R2_BUCKET_NAME", "test-bucket");

    const { getUploadUrl } = await import("./storage");
    const url = new URL(
      await getUploadUrl("test.tflite", { contentType: "application/octet-stream" }),
    );

    expect(url.searchParams.has("x-amz-sdk-checksum-algorithm")).toBe(false);
    expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false);
  });
});
