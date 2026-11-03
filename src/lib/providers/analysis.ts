import { z } from "zod";
import { getCandles, getMarkets, request, ProviderError } from "./binance";
import { intervals } from "../../types/market";
import type { Bundle } from "../domain";
const number = z
  .union([z.string().min(1), z.number()])
  .transform(Number)
  .pipe(z.number().finite());
export async function getBundle(symbol: string): Promise<Bundle> {
  const deadline = AbortSignal.timeout(45000);
  const market = (await getMarkets()).markets.find((m) => m.symbol === symbol);
  if (!market) throw new ProviderError("지원하지 않는 종목", 400);
  const result: Bundle = {
    market,
    bars: {},
    benchmark: {},
    oi: null,
    funding: null,
    depth: null,
    retrievedAt: Date.now(),
    warnings: [],
  };
  // 봉 요청은 2개씩 실행하고 전체 상세 조회를 45초 내로 제한한다.
  const jobs = intervals.flatMap((interval) =>
    (symbol === "BTCUSDT" ? ["BTCUSDT"] : [symbol, "BTCUSDT"]).map(
      (target) => ({ interval, target }),
    ),
  );
  let index = 0;
  await Promise.all(
    [0, 1].map(async () => {
      while (index < jobs.length) {
        const { interval, target } = jobs[index++];
        try {
          deadline.throwIfAborted();
          const data = await getCandles(target, interval, deadline);
          if (target === symbol) result.bars[interval] = data;
          if (target === "BTCUSDT") result.benchmark[interval] = data;
        } catch {
          result.warnings.push(`${target} ${interval} 자료 없음`);
        }
      }
    }),
  );
  try {
    const raw = await request(
      `/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=13`,
      30000,
      deadline,
    );
    result.oi = z
      .array(
        z.object({
          sumOpenInterest: number.pipe(z.number().positive()),
          timestamp: z.number(),
        }),
      )
      .parse(raw)
      .map((o) => ({ value: o.sumOpenInterest, time: o.timestamp }));
  } catch {
    result.warnings.push("OI 자료 없음");
  }
  try {
    const raw = await request(
      `/fapi/v1/premiumIndex?symbol=${symbol}`,
      15000,
      deadline,
    );
    const data = z
      .object({
        lastFundingRate: number,
        time: z.number(),
        nextFundingTime: z.number(),
      })
      .parse(raw);
    result.funding = {
      rate: data.lastFundingRate,
      time: data.time,
      nextTime: data.nextFundingTime,
    };
  } catch {
    result.warnings.push("펀딩 자료 없음");
  }
  try {
    const raw = await request(
      `/fapi/v1/depth?symbol=${symbol}&limit=100`,
      10000,
      deadline,
    );
    const data = z
      .object({
        T: z.number(),
        bids: z.array(
          z.tuple([
            number.pipe(z.number().positive()),
            number.pipe(z.number().nonnegative()),
          ]),
        ),
        asks: z.array(
          z.tuple([
            number.pipe(z.number().positive()),
            number.pipe(z.number().nonnegative()),
          ]),
        ),
      })
      .parse(raw);
    if (
      data.bids.some((v, i) => i > 0 && v[0] >= data.bids[i - 1][0]) ||
      data.asks.some((v, i) => i > 0 && v[0] <= data.asks[i - 1][0]) ||
      !data.bids.length ||
      !data.asks.length ||
      data.asks[0][0] < data.bids[0][0]
    )
      throw Error();
    result.depth = { ...data, time: data.T };
  } catch {
    result.warnings.push("호가 깊이 자료 없음");
  }
  result.retrievedAt = Date.now();
  return result;
}
