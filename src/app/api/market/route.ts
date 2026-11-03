import { NextResponse } from "next/server";
import {
  getMarkets,
  getCandles,
  ProviderError,
} from "../../../lib/providers/binance";
import { intervals, type Interval } from "../../../types/market";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const symbol = query.get("symbol");
  const interval = query.get("interval") ?? "1h";
  if (
    [...query.keys()].some((k) => !["symbol", "interval"].includes(k)) ||
    (symbol && !/^[A-Z0-9_]{2,35}USDT$/.test(symbol)) ||
    !intervals.includes(interval as Interval)
  )
    return NextResponse.json(
      { error: "종목 또는 시간 간격이 올바르지 않습니다." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      symbol
        ? await getCandles(symbol, interval as Interval)
        : await getMarkets(),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ProviderError
            ? error.message
            : "제공자 데이터 검증 실패. 잠시 후 다시 시도하세요.",
        status: "unavailable",
      },
      {
        status: error instanceof ProviderError ? error.status : 502,
        headers: { "Cache-Control": "no-store", "Retry-After": "60" },
      },
    );
  }
}
