import { z } from "zod";
import type { Candle, MarketSymbol } from "../../types/market";
const numeric = z
  .union([z.string().min(1), z.number()])
  .transform(Number)
  .pipe(z.number().finite());
const positive = numeric.pipe(z.number().positive());
const timestamp = z.number().int().positive();
export const exchangeSchema = z.object({
  symbols: z.array(
    z.object({
      symbol: z.string(),
      baseAsset: z.string(),
      contractType: z.string(),
      quoteAsset: z.string(),
      marginAsset: z.string(),
      status: z.string(),
      onboardDate: z.number(),
      filters: z.array(
        z.object({ filterType: z.string(), tickSize: z.string().optional() }),
      ),
    }),
  ),
});
export const tickerSchema = z.object({
  symbol: z.string(),
  lastPrice: positive,
  priceChangePercent: numeric,
  quoteVolume: numeric.pipe(z.number().nonnegative()),
  closeTime: timestamp,
});
export const bookSchema = z
  .object({
    symbol: z.string(),
    bidPrice: positive,
    askPrice: positive,
    time: timestamp,
  })
  .refine((b) => b.askPrice >= b.bidPrice);
export const candleSchema = z
  .tuple([
    timestamp,
    positive,
    positive,
    positive,
    positive,
    numeric.pipe(z.number().nonnegative()),
    timestamp,
  ])
  .rest(z.unknown());
export function normalizeMarkets(
  exchange: unknown,
  tickers: unknown,
  books: unknown,
) {
  const symbols = exchangeSchema.parse(exchange).symbols;
  const warnings: string[] = [];
  const tickerMap = new Map<string, z.infer<typeof tickerSchema>>();
  for (const raw of z.array(z.unknown()).parse(tickers)) {
    const row = tickerSchema.safeParse(raw);
    if (row.success && !tickerMap.has(row.data.symbol))
      tickerMap.set(row.data.symbol, row.data);
    else warnings.push("잘못되거나 중복된 시세 행 제외");
  }
  const bookMap = new Map<string, z.infer<typeof bookSchema>>();
  if (Array.isArray(books))
    for (const raw of books) {
      const row = bookSchema.safeParse(raw);
      if (row.success) bookMap.set(row.data.symbol, row.data);
    }
  else warnings.push("호가 데이터 없음: 스프레드 검증 불가");
  const markets: MarketSymbol[] = [];
  const seen = new Set<string>();
  for (const s of symbols) {
    if (
      s.status !== "TRADING" ||
      s.contractType !== "PERPETUAL" ||
      s.quoteAsset !== "USDT" ||
      s.marginAsset !== "USDT" ||
      seen.has(s.symbol)
    )
      continue;
    seen.add(s.symbol);
    const t = tickerMap.get(s.symbol);
    if (!t) {
      warnings.push(`${s.symbol} 시세 누락`);
      continue;
    }
    const b = bookMap.get(s.symbol);
    const tick = Number(
      s.filters.find((f) => f.filterType === "PRICE_FILTER")?.tickSize,
    );
    if (!Number.isFinite(tick) || tick <= 0) {
      warnings.push(`${s.symbol} 가격 단위 오류`);
      continue;
    }
    markets.push({
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      onboardDate: s.onboardDate,
      tickSize: tick,
      price: t.lastPrice,
      change: t.priceChangePercent,
      quoteVolume: t.quoteVolume,
      closeTime: t.closeTime,
      spread: b
        ? ((b.askPrice - b.bidPrice) / ((b.askPrice + b.bidPrice) / 2)) * 100
        : null,
      bookTime: b?.time ?? null,
    });
  }
  return { markets, warnings: [...new Set(warnings)] };
}
export function normalizeCandles(input: unknown, serverTime: number): Candle[] {
  const rows = z.array(candleSchema).parse(input);
  const output: Candle[] = [];
  for (const r of rows) {
    const [time, open, high, low, close, volume, closeTime] = r;
    if (closeTime >= serverTime) continue; // 미완성 봉은 분석용 데이터에 포함하지 않음
    if (
      closeTime <= time ||
      high < Math.max(open, close) ||
      low > Math.min(open, close) ||
      high < low ||
      (output.length && time <= output[output.length - 1].time * 1000)
    )
      throw new Error("캔들 무결성 검증 실패");
    const taker = Number(r[9]);
    output.push({
      time: time / 1000,
      closeTime,
      open,
      high,
      low,
      close,
      volume,
      ...(r[9] !== undefined &&
      Number.isFinite(taker) &&
      taker >= 0 &&
      taker <= volume
        ? { takerBuyVolume: taker }
        : {}),
    });
  }
  return output;
}
