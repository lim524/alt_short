import { afterEach, describe, it, expect, vi } from "vitest";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe("API boundaries", () => {
  it("rejects invalid proxy symbols without upstream requests", async () => {
    const { GET } = await import("../app/api/market/route");
    expect(
      (
        await GET(
          new Request("http://localhost/api/market?symbol=https://evil.test"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await GET(
          new Request("http://localhost/api/market?url=https://evil.test"),
        )
      ).status,
    ).toBe(400);
  });
  it("gracefully disables AI without keys", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_MODEL", "");
    vi.stubEnv("AI_ACCESS_TOKEN", "");
    const { GET, POST } = await import("../app/api/ai-analysis/route");
    expect((await (await GET()).json()).available).toBe(false);
    expect(
      (
        await POST(
          new Request("http://localhost/api/ai-analysis", {
            method: "POST",
            body: "{}",
          }),
        )
      ).status,
    ).toBe(503);
  });
  it("rejects missing access token before invoking paid providers", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "test-model");
    vi.stubEnv("AI_ACCESS_TOKEN", "01234567890123456789012345678901");
    const { POST } = await import("../app/api/ai-analysis/route");
    expect(
      (
        await POST(
          new Request("http://localhost/api/ai-analysis", {
            method: "POST",
            body: "{}",
          }),
        )
      ).status,
    ).toBe(401);
  });
});
