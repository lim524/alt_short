import { describe, it, expect, vi, afterEach } from "vitest";
import { validateReport } from "../lib/research";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe("grounded research", () => {
  it("accepts current numeric metrics even when optional provider methodology is null", async () => {
    const coin = {
      id: "aave",
      platforms: { ethereum: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9" },
      links: { homepage: ["https://aave.com/"] },
      market_data: {
        market_cap: { usd: 100 },
        fully_diluted_valuation: { usd: 200 },
        circulating_supply: 10,
        total_supply: 20,
        max_supply: 20,
      },
      last_updated: new Date().toISOString(),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.includes("coingecko")
                ? coin
                : url.includes("/tvl/")
                  ? 1000
                  : url.includes("/summary/")
                    ? { total24h: 50, methodology: null }
                    : {
                        topic_list: {
                          topics: [
                            {
                              id: 1,
                              title: "Protocol update",
                              created_at: new Date().toISOString(),
                            },
                          ],
                        },
                      },
            ),
          ),
      ),
    );
    const { getFundamentals } = await import("../lib/providers/fundamentals");
    const report = await getFundamentals("AAVEUSDT");
    expect(report.mapping).toBe("verified");
    expect(report.metrics).toMatchObject({
      marketCapUSD: 100,
      tvlUSD: 1000,
      dailyFees: 50,
      dailyRevenue: 50,
    });
    expect(report.warnings).toEqual([]);
    expect(report.news[0].url).toBe("https://governance.aave.com/t/1");
  });
  it("allows only known evidence and closed vocabulary; rejects fabricated IDs and prose", () => {
    const raw = {
      thesis: "trend-continuation",
      evidenceIds: ["trend"],
      opposing: "short-squeeze",
      uncertainty: "unvalidated-rules",
    };
    expect(validateReport(raw, ["trend"])).toEqual(raw);
    expect(() =>
      validateReport({ ...raw, evidenceIds: ["fake"] }, ["trend"]),
    ).toThrow();
    expect(() =>
      validateReport({ ...raw, thesis: "가격이 10으로 하락" }, ["trend"]),
    ).toThrow();
  });
  it("does not retrieve uncertain symbol mappings", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { getFundamentals } = await import("../lib/providers/fundamentals");
    expect((await getFundamentals("FAKEUSDT")).mapping).toBe("unverified");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("omits fundamentals when canonical contract does not match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "aave",
            platforms: { ethereum: "0xwrong" },
            links: { homepage: ["https://aave.com"] },
            market_data: {
              market_cap: { usd: 1 },
              fully_diluted_valuation: { usd: 2 },
              circulating_supply: 1,
              total_supply: 2,
              max_supply: 2,
            },
            last_updated: new Date().toISOString(),
          }),
        ),
      ),
    );
    const { getFundamentals } = await import("../lib/providers/fundamentals");
    const report = await getFundamentals("AAVEUSDT");
    expect(report.mapping).toBe("unverified");
    expect(report.metrics).toEqual({});
  });
});
