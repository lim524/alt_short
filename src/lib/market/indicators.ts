import type { Candle } from "../../types/market";
export function ema(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const out = [values.slice(0, period).reduce((a, b) => a + b, 0) / period];
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i++)
    out.push(values[i] * alpha + out[out.length - 1] * (1 - alpha));
  return out;
}
export function atr(bars: Candle[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const ranges = bars
    .slice(1)
    .map((b, i) =>
      Math.max(
        b.high - b.low,
        Math.abs(b.high - bars[i].close),
        Math.abs(b.low - bars[i].close),
      ),
    );
  let result = ranges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (const r of ranges.slice(period))
    result = (result * (period - 1) + r) / period;
  return result;
}
export function alignedReturn(
  alt: Candle[],
  btc: Candle[],
  count: number,
): { alt: number; btc: number; relative: number } | null {
  if (alt.length < count + 1) return null;
  const end = alt.at(-1)!;
  const start = alt.at(-1 - count)!;
  const bEnd = btc.find((b) => b.closeTime === end.closeTime);
  const bStart = btc.find((b) => b.closeTime === start.closeTime);
  if (!bEnd || !bStart) return null;
  const a = (end.close / start.close - 1) * 100,
    b = (bEnd.close / bStart.close - 1) * 100;
  return { alt: a, btc: b, relative: a - b };
}
export function fillSlippage(
  book: [number, number][],
  notional: number,
  side: "buy" | "sell",
): number | null {
  if (!book.length || notional <= 0) return null;
  const best = book[0][0];
  let left = notional,
    total = 0,
    qty = 0;
  for (const [price, size] of book) {
    const used = Math.min(left, price * size);
    qty += used / price;
    total += used;
    left -= used;
    if (left <= 1e-8) break;
  }
  if (left > 1e-6 || !qty) return null;
  return Math.max(
    0,
    (side === "sell" ? 1 - total / qty / best : total / qty / best - 1) * 10000,
  );
}
