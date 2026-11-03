import type { Bundle } from "../lib/domain";
import { intervals, type Interval, type MarketSymbol } from "../types/market";
export function fixtureBundle(symbol = "AAVEUSDT", now = Date.now()): Bundle {
  const market: MarketSymbol = {
    symbol,
    baseAsset: symbol.replace("USDT", ""),
    onboardDate: now - 100 * 86400000,
    tickSize: 0.01,
    price: 101,
    change: -4,
    quoteVolume: 5e7,
    spread: 0.02,
    bookTime: now - 1000,
    closeTime: now - 1000,
  };
  const result: Bundle = {
    market,
    bars: {},
    benchmark: {},
    funding: { rate: 0.0001, time: now - 1000, nextTime: now + 1e7 },
    oi: Array.from({ length: 13 }, (_, i) => ({
      value: 10000 + i * 10,
      time: Math.floor(now / 300000) * 300000 - (12 - i) * 300000,
    })),
    depth: {
      bids: [
        [100, 1000],
        [99, 1000],
      ],
      asks: [
        [100.02, 1000],
        [101, 1000],
      ],
      time: now - 1000,
    },
    retrievedAt: now,
    warnings: ["자동 테스트 전용 합성 fixture · 실제 시세 아님"],
  };
  const ms: Record<Interval, number> = {
    "5m": 300000,
    "15m": 900000,
    "1h": 3600000,
    "4h": 14400000,
    "1d": 86400000,
  };
  for (const interval of intervals) {
    const duration = ms[interval],
      end = Math.floor(now / duration) * duration;
    const candles = Array.from({ length: 100 }, (_, i) => {
      const close = 130 - i * 0.3 + Math.sin(i) * 2;
      return {
        time: (end - (100 - i) * duration) / 1000,
        closeTime: end - (99 - i) * duration - 1,
        open: close + 1,
        close,
        high: close + 3,
        low: i === 40 ? 50 : i === 60 ? 60 : close - 2,
        volume: 1000,
        takerBuyVolume: 300,
      };
    });
    result.bars[interval] = {
      symbol,
      interval,
      candles,
      retrievedAt: now,
      expiresAt: now + 15000,
      serverTime: now,
      source: "TEST FIXTURE",
    };
    result.benchmark[interval] = {
      ...result.bars[interval]!,
      symbol: "BTCUSDT",
      candles: candles.map((c) => ({
        ...c,
        open: 100,
        high: 101,
        low: 99,
        close: 100,
      })),
    };
  }
  return result;
}
