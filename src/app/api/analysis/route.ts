import { NextResponse } from "next/server";
import { getBundle } from "../../../lib/providers/analysis";
import { enterBudget } from "../../../lib/api-budget";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol") ?? "";
  if (!/^[A-Z0-9_]{2,35}USDT$/.test(symbol))
    return NextResponse.json({ error: "잘못된 종목" }, { status: 400 });
  const release = enterBudget("analysis", 30, 2);
  if (!release)
    return NextResponse.json(
      { error: "상세 분석 요청 한도. 잠시 후 다시 시도하세요." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  try {
    return NextResponse.json(await getBundle(symbol), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "상세 시장 데이터 연결 실패" },
      { status: 502 },
    );
  } finally {
    release();
  }
}
