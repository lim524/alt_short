import { NextResponse } from "next/server";
import { getMarkets } from "../../../lib/providers/binance";
import { getFundamentals } from "../../../lib/providers/fundamentals";
import { enterBudget } from "../../../lib/api-budget";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams.get("symbol") ?? "";
  if (!/^[A-Z0-9_]{2,35}USDT$/.test(s))
    return NextResponse.json({ error: "종목 오류" }, { status: 400 });
  const release = enterBudget("fundamentals", 12, 2);
  if (!release)
    return NextResponse.json(
      { error: "펀더멘털 조회 한도. 1분 후 다시 시도하세요." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  try {
    if (!(await getMarkets()).markets.some((m) => m.symbol === s))
      return NextResponse.json(
        { error: "지원하지 않는 계약" },
        { status: 400 },
      );
    return NextResponse.json(await getFundamentals(s), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "제공자 연결 실패" }, { status: 502 });
  } finally {
    release();
  }
}
