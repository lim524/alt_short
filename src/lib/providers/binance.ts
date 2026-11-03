import { z } from "zod";
import { normalizeCandles, normalizeMarkets } from "./normalize";
import type {
  MarketSnapshot,
  CandleSnapshot,
  Interval,
} from "../../types/market";
const origin = "https://fapi.binance.com";
const cache = new Map<string, { until: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();
let cooldown = 0;
let active = 0;
export class ProviderError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export async function request(
  path: string,
  ttl: number,
  signal?: AbortSignal,
): Promise<unknown> {
  signal?.throwIfAborted();
  const cached = cache.get(path);
  if (cached && cached.until > Date.now()) return cached.value;
  const existing = pending.get(path);
  if (existing) return existing;
  if (Date.now() < cooldown || active >= 6)
    throw new ProviderError("요청이 많습니다. 잠시 후 다시 시도하세요.", 429);
  const job = (async () => {
    active++;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        let response: Response;
        try {
          response = await fetch(origin + path, {
            signal: signal
              ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
              : AbortSignal.timeout(8000),
            cache: "no-store",
          });
        } catch {
          if (attempt === 0 && !signal?.aborted) continue;
          throw new ProviderError("Binance 연결 시간 초과 또는 네트워크 오류");
        }
        if ([418, 429].includes(response.status)) {
          cooldown = Date.now() + 60000;
          throw new ProviderError(
            "Binance 요청 제한: 1분 후 재시도하세요.",
            429,
          );
        }
        if (!response.ok) {
          if (response.status >= 500 && attempt === 0) {
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }
          throw new ProviderError(
            `Binance 접근 실패 (HTTP ${response.status}). 지역 또는 제공자 정책을 확인하세요.`,
          );
        }
        const reader = response.body?.getReader();
        if (!reader) throw new ProviderError("Binance 응답 없음");
        let size = 0;
        const chunks: Uint8Array[] = [];
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 8_000_000) {
            await reader.cancel();
            throw new ProviderError("응답 크기 제한 초과");
          }
          chunks.push(part.value);
        }
        const merged = new Uint8Array(size);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.length;
        }
        const value: unknown = JSON.parse(new TextDecoder().decode(merged));
        if (cache.size >= 100) cache.delete(cache.keys().next().value!);
        cache.set(path, { until: Date.now() + ttl, value });
        return value;
      }
      throw new ProviderError("Binance 응답 실패");
    } finally {
      active--;
    }
  })();
  pending.set(path, job);
  try {
    return await job;
  } finally {
    pending.delete(path);
  }
}
let snapshot: MarketSnapshot | undefined;
export async function getMarkets(): Promise<MarketSnapshot> {
  if (snapshot && snapshot.expiresAt > Date.now()) return snapshot;
  const [exchange, tickers, book] = await Promise.all([
    request("/fapi/v1/exchangeInfo", 3600000),
    request("/fapi/v1/ticker/24hr", 30000),
    request("/fapi/v1/ticker/bookTicker", 30000).catch(() => null),
  ]);
  const result = normalizeMarkets(exchange, tickers, book);
  snapshot = {
    ...result,
    retrievedAt: Date.now(),
    expiresAt: Date.now() + 30000,
    source: origin,
  };
  return snapshot;
}
const candleCache = new Map<string, CandleSnapshot>();
export async function getCandles(
  symbol: string,
  interval: Interval,
  signal?: AbortSignal,
): Promise<CandleSnapshot> {
  if (!(await getMarkets()).markets.some((m) => m.symbol === symbol))
    throw new ProviderError("지원하지 않는 USDT 무기한 종목입니다.", 400);
  const key = symbol + interval;
  const old = candleCache.get(key);
  if (old && old.expiresAt > Date.now()) return old;
  const [raw, clock] = await Promise.all([
    request(
      `/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=300`,
      15000,
      signal,
    ),
    request("/fapi/v1/time", 1000, signal),
  ]);
  const serverTime = z
    .object({ serverTime: z.number().positive() })
    .parse(clock).serverTime;
  const candles = normalizeCandles(raw, serverTime);
  if (!candles.length)
    throw new ProviderError("완료된 캔들 데이터가 없습니다.");
  const value = {
    candles,
    symbol,
    interval,
    serverTime,
    retrievedAt: Date.now(),
    expiresAt: Date.now() + 15000,
    source: origin,
  };
  if (candleCache.size >= 60)
    candleCache.delete(candleCache.keys().next().value!);
  candleCache.set(key, value);
  return value;
}
