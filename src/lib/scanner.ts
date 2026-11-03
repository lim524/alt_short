import { alignedReturn, atr, ema, fillSlippage } from "./market/indicators";
import { roundTick, pnl } from "./planner";
import {
  defaultRisk,
  type Bundle,
  type MetricEvidence,
  type SignalSnapshot,
  type ScannerConfig,
  type Strategy,
  type Risk,
} from "./domain";
import type { Candle, Interval } from "../types/market";
const durations: Record<Interval, number> = {
  "5m": 300000,
  "15m": 900000,
  "1h": 3600000,
  "4h": 14400000,
  "1d": 86400000,
};
const source = "https://fapi.binance.com";
export function analyze(
  bundle: Bundle,
  strategy: Strategy,
  config: ScannerConfig,
  risk: Risk = defaultRisk,
  now = Date.now(),
): SignalSnapshot {
  const blockers: string[] = [];
  function valid(interval: Interval, benchmark = false): Candle[] {
    const data = (benchmark ? bundle.benchmark : bundle.bars)[interval];
    if (!data) return [];
    const bars = data.candles.filter((b) => b.closeTime < now);
    const last = bars.at(-1);
    if (
      !last ||
      now - data.retrievedAt > 120000 ||
      data.retrievedAt > now + 30000 ||
      now - last.closeTime > durations[interval] + 120000 ||
      bars.some(
        (b, i) =>
          i > 0 &&
          Math.abs(b.time - bars[i - 1].time - durations[interval] / 1000) >
            0.01,
      )
    )
      return [];
    return bars;
  }
  const h = valid("1h"),
    q = valid("15m"),
    five = valid("5m"),
    four = valid("4h"),
    daily = valid("1d");
  const setup = strategy === "day" ? q : four,
    trend = strategy === "day" ? h : four,
    slow = strategy === "day" ? four : daily;
  const last = setup.at(-1),
    prev = setup.at(-2);
  const a = atr(setup);
  const e20 = ema(
      trend.map((b) => b.close),
      20,
    ).at(-1),
    e50 = ema(
      trend.map((b) => b.close),
      50,
    ).at(-1),
    s20 = ema(
      slow.map((b) => b.close),
      20,
    ).at(-1),
    s50 = ema(
      slow.map((b) => b.close),
      50,
    ).at(-1);
  const relative =
    strategy === "day"
      ? alignedReturn(h, valid("1h", true), 4)
      : alignedReturn(daily, valid("1d", true), 7);
  const relLimit =
    strategy === "day" ? config.dayWeakness : config.swingWeakness;
  const weights = strategy === "day" ? config.dayWeights : config.swingWeights;
  const factors: MetricEvidence[] = [];
  const add = (
    id: string,
    name: string,
    index: number,
    pass: boolean | null,
    actual: string,
    threshold: string,
    explanation: string,
    at = last?.closeTime ?? null,
  ) =>
    factors.push({
      id,
      name,
      weight: weights[index],
      points: pass === true ? weights[index] : 0,
      status: pass === null ? "unknown" : pass ? "pass" : "fail",
      actual,
      threshold,
      explanation,
      at,
      source,
    });
  const bearish =
    e20 !== undefined && e50 !== undefined && trend.at(-1)
      ? e20 < e50 && trend.at(-1)!.close < e20
      : null;
  const dual =
    bearish === null || s20 === undefined || s50 === undefined
      ? null
      : bearish && s20 < s50 && slow.at(-1)!.close < s20;
  const rejectionEma = ema(
    setup.map((b) => b.close),
    20,
  ).at(-1);
  const rejection =
    last && rejectionEma
      ? last.high >= rejectionEma &&
        last.close < rejectionEma &&
        last.close < last.open
      : null;
  const support =
    setup.length >= 52
      ? Math.min(...setup.slice(-51, -1).map((b) => b.low))
      : null;
  const broken =
    last && prev && support !== null
      ? last.close < support && last.high >= support
      : null;
  const flowBars = q.slice(-4);
  const buy = flowBars.reduce((n, b) => n + (b.takerBuyVolume ?? 0), 0),
    volume = flowBars.reduce((n, b) => n + b.volume, 0);
  const ratio =
    flowBars.length === 4 &&
    flowBars.every((b) => b.takerBuyVolume !== undefined) &&
    buy > 0
      ? (volume - buy) / buy
      : null;
  const oi = bundle.oi?.filter((o) => o.time <= now && now - o.time <= 3900000);
  const first = oi?.[0],
    end = oi?.at(-1);
  const oiChange =
    first &&
    end &&
    first !== end &&
    now - end.time < 600000 &&
    oi!.length >= 12 &&
    oi!.every((v, i) => i === 0 || v.time - oi![i - 1].time === 300000)
      ? (end.value / first.value - 1) * 100
      : null;
  const funding =
    bundle.funding &&
    now - bundle.funding.time < 120000 &&
    bundle.funding.time <= now + 30000
      ? bundle.funding.rate
      : null;
  const oiPass =
    oiChange === null || funding === null || !last || !prev
      ? null
      : oiChange > 0 && last.close < prev.close && funding >= 0;
  const btc = alignedReturn(h, valid("1h", true), 4);
  if (strategy === "day") {
    add(
      "trend",
      "1h 하락 추세",
      0,
      bearish,
      `EMA20 ${e20 ?? "없음"} / EMA50 ${e50 ?? "없음"}`,
      "EMA20 < EMA50, 종가 < EMA20",
      "1h 완료 봉 EMA 비교",
      h.at(-1)?.closeTime,
    );
    add(
      "rejection",
      "15m 반등 거부",
      1,
      rejection,
      `고가 ${last?.high ?? "없음"} / 종가 ${last?.close ?? "없음"} / EMA20 ${rejectionEma ?? "없음"}`,
      "고가 ≥ EMA20, 음봉 종가 < EMA20",
      "반등 후 평균 아래로 마감한 캔들",
    );
    add(
      "flow",
      "1h 체결 매도 우위",
      2,
      ratio === null ? null : ratio >= config.sellRatio,
      `매도/매수 ${ratio?.toFixed(3) ?? "없음"}`,
      `최근 15m 4개 합계 ≥ ${config.sellRatio}`,
      "Binance kline taker buy 기초자산 거래량으로 매도량을 계산",
      q.at(-1)?.closeTime,
    );
    add(
      "relative",
      "BTC 대비 4h 약세",
      3,
      relative ? relative.relative <= -relLimit : null,
      `${relative?.relative.toFixed(3) ?? "없음"} %p`,
      `상대 수익률 ≤ -${relLimit} %p`,
      "동일 시작·종료 시각의 1h 종가 비교",
      h.at(-1)?.closeTime,
    );
    add(
      "context",
      "OI·펀딩 복합 맥락",
      4,
      oiPass,
      `OI ${oiChange?.toFixed(3) ?? "없음"}% / 펀딩 ${funding === null ? "없음" : (funding * 100).toFixed(5) + "%"}`,
      "최근 ~1h OI 증가 + 가격 하락 + 펀딩 ≥ 0",
      "OI 또는 양수 펀딩 하나만으로 하락 판단하지 않음",
    );
  } else {
    add(
      "trend",
      "4h·1D 하락 구조",
      0,
      dual,
      `4h EMA20/50 ${e20 ?? "없음"} / ${e50 ?? "없음"}; 1D ${s20 ?? "없음"} / ${s50 ?? "없음"}`,
      "두 주기 EMA20 < EMA50, 종가 < EMA20",
      "완료된 4h와 1D 추세 교차 확인",
      daily.at(-1)?.closeTime,
    );
    add(
      "relative",
      "BTC 대비 7일 약세",
      1,
      relative ? relative.relative <= -relLimit : null,
      `${relative?.relative.toFixed(3) ?? "없음"} %p`,
      `7일 상대 수익률 ≤ -${relLimit} %p`,
      "정렬된 1D 종가 비교",
      daily.at(-1)?.closeTime,
    );
    add(
      "break",
      "4h 지지 이탈·재시험",
      2,
      broken,
      `이전 50봉 지지 ${support ?? "없음"} / 고가 ${last?.high ?? "없음"} / 종가 ${last?.close ?? "없음"}`,
      "현재 고가 ≥ 이전 지지, 종가 < 이전 지지",
      "동일 봉 내부 순서는 알 수 없어 OHLC 재시험 가설로 한정",
    );
    const avg = setup.slice(-21, -1).reduce((s, b) => s + b.volume, 0) / 20;
    add(
      "oi",
      "OI·거래량 맥락",
      3,
      oiChange === null || !last || setup.length < 21
        ? null
        : oiChange > 0 && last.close < last.open && last.volume > avg,
      `~1h OI ${oiChange?.toFixed(3) ?? "없음"}%; 4h 거래량 ${last?.volume ?? "없음"} / 평균 ${avg}`,
      "OI 증가, 4h 음봉 거래량 > 이전 20봉 평균",
      "OI 기간과 캔들 기간이 다르며 보조 맥락으로만 사용",
    );
    add(
      "funding",
      "펀딩·시장 국면",
      4,
      funding === null || !btc || !last || !prev
        ? null
        : funding >= 0 && btc.btc <= 0 && last.close < prev.close,
      `펀딩 ${funding === null ? "없음" : funding * 100 + "%"} / BTC 4h ${btc?.btc.toFixed(3) ?? "없음"}%`,
      "펀딩 ≥ 0, BTC 4h ≤ 0, 4h 종가 하락",
      "매도 포지션의 예상 펀딩은 별도 시나리오 가정",
    );
  }
  const tick = bundle.market.tickSize;
  if (
    bundle.market.quoteVolume < 1000000 ||
    bundle.market.onboardDate <= 0 ||
    now - bundle.market.onboardDate < 14 * 86400000
  )
    blockers.push("거래대금 또는 상장 기간 안전 조건 미달");
  const entry = prev ? roundTick(prev.low - tick, tick, "down") : null;
  const stop =
    setup.length >= 20 && a
      ? roundTick(
          Math.max(...setup.slice(-20).map((b) => b.high)) +
            a * config.atrBuffer,
          tick,
          "up",
        )
      : null;
  const supports = entry
    ? setup
        .slice(0, -2)
        .filter(
          (b, i, all) =>
            i > 0 &&
            i < all.length - 1 &&
            b.low < all[i - 1].low &&
            b.low <= all[i + 1].low &&
            b.low < entry,
        )
        .map((b) => roundTick(b.low, tick, "down"))
        .sort((a, b) => b - a)
    : [];
  const distinct = [...new Set(supports)];
  const proposed =
    entry && stop && distinct.length >= 2 && stop > entry
      ? { entry, stop, tp1: distinct[0], tp2: distinct[1] }
      : null;
  const net = proposed ? pnl(proposed, risk) : null;
  if (
    !proposed ||
    !net ||
    net.netRR < (strategy === "day" ? config.dayRR : config.swingRR)
  )
    blockers.push("구조적 지지 목표 또는 순손익비 부족");
  const coverage = factors
      .filter((f) => f.status !== "unknown")
      .reduce((s, f) => s + f.weight, 0),
    score = factors.reduce((s, f) => s + f.points, 0);
  if (coverage < 100) blockers.push("필수 지표 자료 미확인");
  if (
    now - bundle.retrievedAt > 120000 ||
    now - bundle.market.closeTime > 120000 ||
    !bundle.market.bookTime ||
    now - bundle.market.bookTime > 120000 ||
    bundle.market.spread === null ||
    bundle.market.spread > 0.15
  )
    blockers.push("시세·호가 신선도 또는 스프레드 위험");
  if (
    !bundle.depth ||
    now - bundle.depth.time > 30000 ||
    fillSlippage(bundle.depth.bids, risk.margin * risk.leverage, "sell") ===
      null ||
    fillSlippage(bundle.depth.asks, risk.margin * risk.leverage, "buy") === null
  )
    blockers.push("호가 깊이 부족 또는 측정 만료");
  const jump = five.at(-1);
  if (!jump || jump.close / jump.open - 1 > 0.15)
    blockers.push("5m 이상 변동 또는 자료 부족");
  if (!btc || btc.btc > 5) blockers.push("BTC 급등 또는 시장 국면 자료 부족");
  const triggerBar = (strategy === "day" ? five : h).at(-1);
  const confirmed = !!(
    proposed &&
    triggerBar &&
    triggerBar.close < proposed.entry &&
    triggerBar.close > proposed.tp1
  );
  const state =
    score >= config.watchScore && blockers.length === 0
      ? confirmed
        ? "TRIGGERED"
        : "SETUP"
      : "WATCH";
  const createdAt = now,
    expiresAt = now + (strategy === "day" ? 1800000 : 14400000);
  const transitions: SignalSnapshot["transitions"] = [
    { state: "WATCH", at: now, reason: "측정 시작 · 관찰 상태" },
  ];
  if (state !== "WATCH")
    transitions.push({
      state: "SETUP",
      at: now,
      reason: "점수·구조·안전 조건 충족",
    });
  if (state === "TRIGGERED")
    transitions.push({
      state: "TRIGGERED",
      at: now,
      reason: "완료된 트리거 봉 확인",
    });
  return {
    id: crypto.randomUUID(),
    symbol: bundle.market.symbol,
    strategy,
    state,
    createdAt,
    expiresAt,
    barCloseTime: last?.closeTime ?? 0,
    retrievedAt: bundle.retrievedAt,
    config: structuredClone(config),
    riskAssumptions: structuredClone(risk),
    codeVersion: "scanner-1.0",
    score,
    coverage,
    factors,
    supporting: factors
      .filter((f) => f.status === "pass")
      .map((f) => f.name + ": " + f.actual),
    opposing: factors
      .filter((f) => f.status !== "pass")
      .map((f) => f.name + ": " + f.status + " " + f.actual),
    trigger:
      "이전 설정 봉 저점 아래 진입선 + 완료된 5m(day)/1h(swing) 종가 확인, 모든 안전 조건과 순 R:R 충족",
    invalidation: proposed
      ? `관측된 가격이 손절 ${proposed.stop} 이상이면 무효`
      : "유효한 구조적 계획 없음",
    blockers,
    proposed,
    levelReason: `진입=이전 설정 봉 저점 - 1 tick; 손절=최근 20봉 고가 + ATR14 × ${config.atrBuffer}; TP=과거 국소 저점 중 가까운 두 지지. 조건부 모의 가격.`,
    transitions,
    raw: structuredClone(bundle),
  };
}
export function followSignal(
  signal: SignalSnapshot,
  price: number,
  now: number,
): SignalSnapshot {
  if (["EXPIRED", "INVALIDATED"].includes(signal.state)) return signal;
  const state =
    now >= signal.expiresAt
      ? "EXPIRED"
      : signal.proposed && price >= signal.proposed.stop
        ? "INVALIDATED"
        : signal.state;
  return state === signal.state
    ? signal
    : {
        ...signal,
        state,
        transitions: [
          ...signal.transitions,
          {
            state,
            at: now,
            reason:
              state === "EXPIRED"
                ? "유효 시간 경과"
                : "후속 관측 가격이 손절 이상",
          },
        ],
      };
}
