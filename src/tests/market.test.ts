import { describe, it, expect, vi, afterEach } from "vitest";
import { normalizeCandles, normalizeMarkets } from "../lib/providers/normalize";
import { defaults, filterMarkets } from "../lib/market/filter";
const now = 1800000000000;
const contract = {
  symbol: "SOLUSDT",
  baseAsset: "SOL",
  contractType: "PERPETUAL",
  quoteAsset: "USDT",
  marginAsset: "USDT",
  status: "TRADING",
  onboardDate: now - 30 * 86400000,
  filters: [{ filterType: "PRICE_FILTER", tickSize: "0.01" }],
};
const ticker = {
  symbol: "SOLUSDT",
  lastPrice: "100",
  priceChangePercent: "-2",
  quoteVolume: "2000000",
  closeTime: now,
};
const book = {
  symbol: "SOLUSDT",
  bidPrice: "99.99",
  askPrice: "100.01",
  time: now,
};
function fixture() {
  return normalizeMarkets({ symbols: [contract] }, [ticker], [book]).markets[0];
}
describe("public data integrity", () => {
  it("filters non-USDT, inactive and dated contracts and duplicate metadata", () => {
    const data = normalizeMarkets(
      {
        symbols: [
          contract,
          contract,
          { ...contract, symbol: "BADUSDT", status: "BREAK" },
          { ...contract, contractType: "CURRENT_QUARTER" },
          { ...contract, marginAsset: "USDC" },
        ],
      },
      [ticker],
      [book],
    );
    expect(data.markets).toHaveLength(1);
    expect(data.markets[0].spread).toBeCloseTo(0.02);
  });
  it("does not substitute zero for missing books", () => {
    const result = normalizeMarkets({ symbols: [contract] }, [ticker], null);
    expect(result.markets[0].spread).toBeNull();
    expect(filterMarkets(result.markets, defaults, now).standard).toHaveLength(
      0,
    );
  });
  it("rejects invalid price and warns", () => {
    const data = normalizeMarkets(
      { symbols: [contract] },
      [{ ...ticker, lastPrice: "NaN" }],
      [book],
    );
    expect(data.markets).toHaveLength(0);
    expect(data.warnings.length).toBeGreaterThan(0);
  });
  it("separates low liquidity and excludes stale, new and benchmark assets", () => {
    const m = fixture();
    const result = filterMarkets(
      [
        m,
        { ...m, symbol: "LOWUSDT", quoteVolume: 750000 },
        { ...m, symbol: "BTCUSDT" },
        { ...m, symbol: "OLDUSDT", closeTime: now - 121000 },
        { ...m, symbol: "NEWUSDT", onboardDate: now - 86400000 },
        { ...m, symbol: "BOOKUSDT", bookTime: now - 121000 },
      ],
      defaults,
      now,
    );
    expect(result.standard.map((m) => m.symbol)).toEqual(["SOLUSDT"]);
    expect(result.watch.map((m) => m.symbol)).toEqual(["LOWUSDT"]);
  });
  it("only returns closed bars with exchange server time", () => {
    expect(
      normalizeCandles(
        [
          [1000, "10", "12", "9", "11", "50", 1999],
          [2000, "11", "13", "10", "12", "20", 2999],
        ],
        2500,
      ),
    ).toEqual([
      {
        time: 1,
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 50,
        closeTime: 1999,
      },
    ]);
  });
  it("rejects malformed and duplicate candle history", () => {
    expect(() =>
      normalizeCandles([[1000, "10", "8", "9", "11", "50", 1999]], now),
    ).toThrow();
    expect(() =>
      normalizeCandles(
        [
          [1000, "10", "12", "9", "11", "50", 1999],
          [1000, "10", "12", "9", "11", "50", 1999],
        ],
        now,
      ),
    ).toThrow();
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe("provider failures", () => {
  it("returns unavailable on rate limiting and does not repeatedly hit provider", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    const { getMarkets } = await import("../lib/providers/binance");
    await expect(getMarkets()).rejects.toThrow("요청 제한");
    await expect(getMarkets()).rejects.toThrow();
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(3);
  });
  it("retries network timeout once then fails without fabricated data", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    vi.stubGlobal("fetch", fetch);
    const { getMarkets } = await import("../lib/providers/binance");
    await expect(getMarkets()).rejects.toThrow("시간 초과");
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(6);
  });
});
