import assert from "node:assert/strict";
const origin = process.env.BASE_URL ?? "http://localhost:3002";
async function get(path) {
  const started = Date.now();
  console.log("Checking", path);
  const r = await fetch(origin + path, { signal: AbortSignal.timeout(90000) });
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  console.log("OK", path, `${Date.now() - started}ms`);
  return data;
}
const market = await get("/api/market");
assert(market.markets.length > 0);
const b = await get("/api/analysis?symbol=AAVEUSDT");
const bars = Object.fromEntries(
  Object.entries(b.bars).map(([i, s]) => {
    assert(s.candles.every((c) => c.closeTime < s.serverTime));
    return [i, s.candles.length];
  }),
);
assert.equal(Object.keys(bars).length, 5);
const fundamentals = await get("/api/fundamentals?symbol=AAVEUSDT");
const ai = await get("/api/ai-analysis");
const invalid = await fetch(origin + "/api/analysis?symbol=invalid");
assert.equal(invalid.status, 400);
console.log(
  JSON.stringify(
    {
      markets: market.markets.length,
      bars,
      oiRows: b.oi?.length ?? null,
      funding: b.funding,
      depth: b.depth
        ? { bids: b.depth.bids.length, asks: b.depth.asks.length }
        : null,
      warnings: b.warnings,
      fundamentals: {
        mapping: fundamentals.mapping,
        metrics: fundamentals.metrics,
        warnings: fundamentals.warnings,
        sources: fundamentals.sources.map((s) => s.url),
      },
      ai,
      invalidStatus: invalid.status,
    },
    null,
    2,
  ),
);
