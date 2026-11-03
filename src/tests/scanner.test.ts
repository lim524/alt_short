import { describe, it, expect } from "vitest";
import {
  ema,
  atr,
  alignedReturn,
  fillSlippage,
} from "../lib/market/indicators";
import { pnl, roundTick } from "../lib/planner";
import { defaultConfig, defaultRisk, type Bundle } from "../lib/domain";
import { analyze, followSignal } from "../lib/scanner";
import { fixtureBundle } from "./fixtures";
import type { Candle } from "../types/market";
const candle = (i: number): Candle => ({
  time: i * 3600,
  closeTime: (i + 1) * 3600000 - 1,
  open: 10,
  high: 12,
  low: 8,
  close: 10 + i,
  volume: 100,
});
describe("indicators", () => {
  it("seeds EMA with SMA and uses exponential update", () =>
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([2, 3, 4]));
  it("does not fabricate insufficient history", () => {
    expect(ema([1], 20)).toEqual([]);
    expect(atr([candle(1)])).toBeNull();
  });
  it("ATR includes gaps from previous close", () =>
    expect(
      atr(
        [
          { ...candle(0), close: 10 },
          { ...candle(1), high: 15, low: 12, close: 14 },
        ],
        1,
      ),
    ).toBe(5));
  it("requires exact benchmark timestamps", () => {
    expect(
      alignedReturn([candle(0), candle(1)], [candle(2), candle(3)], 1),
    ).toBeNull();
    expect(
      alignedReturn([candle(0), candle(1)], [candle(0), candle(1)], 1)
        ?.relative,
    ).toBe(0);
  });
  it("simulates both book sides and rejects insufficient depth", () => {
    expect(
      fillSlippage(
        [
          [100, 1],
          [99, 2],
        ],
        199,
        "sell",
      ),
    ).toBeCloseTo(50);
    expect(fillSlippage([[100, 1]], 200, "sell")).toBeNull();
  });
});
describe("short planner", () => {
  const levels = { entry: 100, stop: 110, tp1: 90, tp2: 80 };
  it("calculates partial targets and both-side fees", () => {
    const p = pnl(levels, {
      ...defaultRisk,
      margin: 100,
      leverage: 1,
      feeBps: 10,
      slippageBps: 0,
    })!;
    expect(p.loss).toBeCloseTo(10.21);
    expect(p.reward).toBeCloseTo(14.815);
  });
  it("models positive funding as short income", () => {
    const a = pnl(levels, { ...defaultRisk, fundingPct: 1 })!,
      b = pnl(levels, { ...defaultRisk, fundingPct: -1 })!;
    expect(a.reward - b.reward).toBe(4);
    expect(b.loss - a.loss).toBe(4);
  });
  it("does not change RR with leverage alone", () =>
    expect(pnl(levels, { ...defaultRisk, leverage: 1 })!.netRR).toBeCloseTo(
      pnl(levels, { ...defaultRisk, leverage: 2 })!.netRR,
    ));
  it("rejects invalid geometry and allocation", () => {
    expect(pnl({ ...levels, stop: 90 }, defaultRisk)).toBeNull();
    expect(pnl(levels, { ...defaultRisk, tp1Pct: 110 })).toBeNull();
  });
  it("rounds tick in required direction", () => {
    expect(roundTick(0.1234, 0.001, "up")).toBe(0.124);
    expect(roundTick(0.1234, 0.001, "down")).toBe(0.123);
  });
});
describe("signal integrity", () => {
  it("logs setup and closed-bar trigger stages, and blocks unsafe liquidity", () => {
    const now = Date.now(),
      bundle = fixtureBundle("AAVEUSDT", now);
    const setup = analyze(bundle, "day", defaultConfig, defaultRisk, now);
    expect(setup.state).toBe("SETUP");
    expect(setup.coverage).toBe(100);
    const bar = bundle.bars["5m"]!.candles.at(-1)!;
    bar.close = setup.proposed!.entry - 0.1;
    bar.low = bar.close - 0.1;
    const trigger = analyze(bundle, "day", defaultConfig, defaultRisk, now);
    expect(trigger.state).toBe("TRIGGERED");
    expect(trigger.transitions.map((t) => t.state)).toEqual([
      "WATCH",
      "SETUP",
      "TRIGGERED",
    ]);
    bundle.depth = null;
    expect(analyze(bundle, "day", defaultConfig, defaultRisk, now).state).toBe(
      "WATCH",
    );
  });
  it("never scores a misaligned benchmark or a gapped price series", () => {
    const now = Date.now(),
      bundle = fixtureBundle("AAVEUSDT", now);
    bundle.benchmark["1h"]!.candles.forEach((c) => (c.closeTime += 1));
    expect(
      analyze(bundle, "day", defaultConfig, defaultRisk, now).factors.find(
        (f) => f.id === "relative",
      )?.status,
    ).toBe("unknown");
    bundle.bars["1h"]!.candles.splice(50, 1);
    expect(
      analyze(bundle, "day", defaultConfig, defaultRisk, now).factors[0].status,
    ).toBe("unknown");
  });
  const empty: Bundle = {
    market: {
      symbol: "SOLUSDT",
      baseAsset: "SOL",
      onboardDate: 1,
      tickSize: 0.01,
      price: 100,
      change: 0,
      quoteVolume: 1e7,
      spread: 0.01,
      bookTime: 1000,
      closeTime: 1000,
    },
    bars: {},
    benchmark: {},
    oi: null,
    funding: null,
    depth: null,
    retrievedAt: 1000,
    warnings: [],
  };
  it("missing data scores zero with no actionable state", () => {
    const s = analyze(empty, "day", defaultConfig, defaultRisk, 1000);
    expect(s.score).toBe(0);
    expect(s.coverage).toBe(0);
    expect(s.state).toBe("WATCH");
    expect(s.proposed).toBeNull();
  });
  it("expires or invalidates without mutating original", () => {
    const s = analyze(empty, "swing", defaultConfig, defaultRisk, 1000);
    const next = followSignal(s, 100, s.expiresAt);
    expect(next.state).toBe("EXPIRED");
    expect(s.state).toBe("WATCH");
    expect(next.transitions).toHaveLength(2);
    const stop = followSignal(
      { ...s, proposed: { entry: 100, stop: 110, tp1: 90, tp2: 80 } },
      111,
      2000,
    );
    expect(stop.state).toBe("INVALIDATED");
  });
  it("ignores future bars and stale bundles", () => {
    const future = {
      ...empty,
      bars: {
        "1h": {
          symbol: "SOLUSDT",
          interval: "1h" as const,
          retrievedAt: 1000,
          expiresAt: 2000,
          serverTime: 1000,
          source: "test",
          candles: Array.from({ length: 60 }, (_, i) => candle(i)),
        },
      },
    };
    const s = analyze(future, "day", defaultConfig, defaultRisk, 1000);
    expect(s.factors[0].status).toBe("unknown");
    expect(s.blockers.length).toBeGreaterThan(0);
  });
});
