"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { defaults, filterMarkets, type Filters } from "../lib/market/filter";
import { intervals, type Interval, type MarketSnapshot } from "../types/market";
import {
  defaultConfig,
  defaultRisk,
  configSchema,
  riskSchema,
  type ScannerConfig,
  type SignalSnapshot,
  type Levels,
  type Risk,
  type Bundle,
  type Strategy,
} from "../lib/domain";
import { analyze, followSignal } from "../lib/scanner";
import {
  list,
  setPreference,
  saveScenario,
  saveObservation,
  toggleWatch,
  type PlanEdit,
} from "../lib/storage";
import Planner from "./Planner";
import History from "./History";
import Settings from "./Settings";
import Research from "./Research";
const Chart = dynamic(() => import("./MarketChart"), {
  ssr: false,
  loading: () => <div className="empty">차트 준비 중…</div>,
});
const number = (n: number) =>
  n.toLocaleString("ko-KR", { maximumFractionDigits: 8 });
const time = (n: number) =>
  new Date(n).toLocaleString("ko-KR", { hour12: false });
async function load<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: "no-store" });
  const value = await res.json();
  if (!res.ok) throw Error(value.error ?? "데이터 요청 실패");
  return value;
}
export default function Dashboard() {
  const [tab, setTab] = useState<"scan" | "history" | "settings">("scan"),
    [running, setRunning] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [market, setMarket] = useState<MarketSnapshot>(),
    [signals, setSignals] = useState<SignalSnapshot[]>([]),
    [active, setActive] = useState<SignalSnapshot>(),
    [levels, setLevels] = useState<Levels | null>(null),
    [risk, setRisk] = useState<Risk>(defaultRisk),
    [config, setConfig] = useState<ScannerConfig>(defaultConfig),
    [filters, setFilters] = useState<Filters>(defaults);
  const [strategy, setStrategy] = useState<Strategy | "all">("all"),
    [interval, setIntervalValue] = useState<Interval>("15m"),
    [minutes, setMinutes] = useState(5),
    [focusTime, setFocusTime] = useState<number>(),
    [now, setNow] = useState(0),
    [minimum, setMinimum] = useState(0),
    [stateFilter, setStateFilter] = useState("all"),
    [watch, setWatch] = useState<string[]>([]),
    [watchOnly, setWatchOnly] = useState(false);
  const controller = useRef<AbortController | null>(null),
    scanning = useRef(false),
    latest = useRef({ config, risk, filters }),
    lastSignals = useRef<SignalSnapshot[]>([]);
  latest.current = { config, risk, filters };
  const select = useCallback((s: SignalSnapshot, edit?: PlanEdit) => {
    setActive(s);
    setLevels(edit?.levels ?? s.proposed);
    setRisk(edit?.risk ?? s.riskAssumptions);
    setIntervalValue(s.strategy === "day" ? "15m" : "4h");
    setTab("scan");
    setFocusTime(undefined);
  }, []);
  useEffect(() => {
    let alive = true;
    setNow(Date.now());
    void Promise.all([
      list<{ id: string; value: unknown }>("settings"),
      list<{ id: string }>("watchlist"),
    ])
      .then(([prefs, watched]) => {
        if (!alive) return;
        for (const p of prefs) {
          if (p.id === "config") {
            const c = configSchema.safeParse(p.value);
            if (c.success) setConfig(c.data);
          }
          if (p.id === "risk") {
            const r = riskSchema.safeParse(p.value);
            if (r.success) setRisk(r.data);
          }
        }
        setWatch(watched.map((w) => w.id));
      })
      .catch(() =>
        setMessage(
          "저장소에 접근할 수 없습니다. 비공개 모드/권한을 확인하세요.",
        ),
      );
    const timer = window.setInterval(() => setNow(Date.now()), 10000);
    return () => {
      alive = false;
      clearInterval(timer);
      controller.current?.abort();
    };
  }, []);
  const refresh = useCallback(async () => {
    if (scanning.current) return;
    scanning.current = true;
    const ac = new AbortController();
    controller.current = ac;
    setBusy(true);
    setError("");
    try {
      const prefs = structuredClone(latest.current);
      const snapshot = await load<MarketSnapshot>("/api/market", ac.signal);
      if (ac.signal.aborted) return;
      setMarket(snapshot);
      setNow(Date.now());
      const candidates = filterMarkets(
        snapshot.markets,
        prefs.filters,
        Date.now(),
      )
        .standard.filter((m) => !["BTCUSDT", "ETHUSDT"].includes(m.symbol))
        .sort((a, b) => a.change - b.change)
        .slice(0, prefs.config.candidateLimit);
      const next: SignalSnapshot[] = [];
      for (let i = 0; i < candidates.length; i++) {
        if (ac.signal.aborted) return;
        const candidate = candidates[i];
        setProgress(
          `${i + 1}/${candidates.length} · ${candidate.symbol} 상세 확인`,
        );
        try {
          const bundle = await load<Bundle>(
            `/api/analysis?symbol=${candidate.symbol}`,
            ac.signal,
          );
          if (ac.signal.aborted) return;
          for (const style of ["day", "swing"] as const) {
            let signal = analyze(bundle, style, prefs.config, prefs.risk);
            const previous = lastSignals.current.find(
              (s) =>
                s.symbol === signal.symbol &&
                s.strategy === style &&
                s.barCloseTime === signal.barCloseTime &&
                JSON.stringify(s.config) === JSON.stringify(signal.config),
            );
            if (previous) {
              const followed = followSignal(
                previous,
                bundle.market.price,
                Date.now(),
              );
              signal = {
                ...signal,
                createdAt: previous.createdAt,
                expiresAt: previous.expiresAt,
                state: ["EXPIRED", "INVALIDATED", "TRIGGERED"].includes(
                  followed.state,
                )
                  ? followed.state
                  : signal.state,
                transitions: followed.transitions,
              };
              if (
                signal.state !== previous.state &&
                !["EXPIRED", "INVALIDATED"].includes(signal.state)
              )
                signal.transitions = [
                  ...signal.transitions,
                  {
                    state: signal.state,
                    at: Date.now(),
                    reason: "동일 설정 봉의 최신 완료 트리거 봉 재평가",
                  },
                ];
            }
            await saveObservation(signal).catch(() =>
              setMessage("측정 기록 자동 저장 실패 · 저장 공간을 확인하세요."),
            );
            next.push(signal);
          }
          setSignals([...next]);
        } catch (e) {
          if (ac.signal.aborted) return;
          setError(
            `${candidate.symbol}: ${e instanceof Error ? e.message : "상세 데이터 오류"} · 나머지 후보는 계속 분석합니다.`,
          );
        }
      }
      if (!ac.signal.aborted) {
        lastSignals.current = next;
        setSignals(next);
        setProgress(
          `완료 · 전체 ${snapshot.markets.length}개 중 거래대금/상장/호가 필터 후 24h 하락률순 ${candidates.length}개 상세 분석`,
        );
      }
    } catch (e) {
      if (!ac.signal.aborted)
        setError(e instanceof Error ? e.message : "스캔 실패");
    } finally {
      scanning.current = false;
      if (controller.current === ac) {
        setBusy(false);
      }
    }
  }, []);
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (cancelled) return;
      if (scanning.current && controller.current?.signal.aborted) {
        retry = setTimeout(start, 50);
        return;
      }
      void refresh();
    };
    start();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, minutes * 60000);
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      controller.current?.abort();
    };
  }, [running, minutes, refresh]);
  const result = useMemo(
    () => filterMarkets(market?.markets ?? [], filters, now),
    [market, filters, now],
  );
  const ranked = signals
    .filter(
      (s) =>
        (strategy === "all" || s.strategy === strategy) &&
        s.score >= minimum &&
        (stateFilter === "all" ||
          followSignal(
            s,
            market?.markets.find((m) => m.symbol === s.symbol)?.price ?? 0,
            now,
          ).state === stateFilter) &&
        s.symbol.includes(filters.search.toUpperCase()) &&
        (!watchOnly || watch.includes(s.symbol)),
    )
    .sort((a, b) => b.score - a.score);
  const bundle = active?.raw as Bundle | undefined;
  const candles = bundle?.bars[interval]?.candles;
  const displayState = active
    ? followSignal(
        active,
        market?.markets.find((m) => m.symbol === active.symbol)?.price ?? 0,
        now,
      ).state
    : null;
  async function openBenchmark(symbol: string) {
    if (busy) {
      setMessage("현재 스캔이 끝난 뒤 벤치마크를 여세요.");
      return;
    }
    setMessage("벤치마크 불러오는 중…");
    try {
      const b = await load<Bundle>(
        `/api/analysis?symbol=${symbol}`,
        new AbortController().signal,
      );
      select(analyze(b, "day", config, risk));
      setMessage("벤치마크는 기본 후보 순위에서 제외됩니다.");
    } catch {
      setMessage("벤치마크 연결 실패");
    }
  }
  return (
    <main>
      <header>
        <a className="brand" href="/">
          ▥{" "}
          <span>
            ALT<span className="accent">SHORT</span>
          </span>
          <small>RESEARCH DESK</small>
        </a>
        <span className="badge">READ ONLY · PAPER</span>
      </header>
      <nav className="main-nav">
        {(
          [
            ["scan", "시장 스캐너"],
            ["history", "저장 시나리오"],
            ["settings", "설정·데이터 상태"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <p role="status" className="subtle">
        {message}
      </p>
      {tab === "history" ? (
        <History onOpen={select} />
      ) : tab === "settings" ? (
        <Settings
          config={config}
          onChange={(c) => {
            setConfig(c);
            void setPreference("config", c).catch(() =>
              setMessage("설정 저장 실패"),
            );
          }}
        />
      ) : (
        <>
          <section className="intro">
            <div>
              <p className="eyebrow">BINANCE USDⓈ-M / ON-DEMAND SCANNER</p>
              <h1>
                약세의 근거를 찾고,
                <br />
                <span className="muted">위험을 먼저 설계하세요.</span>
              </h1>
              <p className="subtitle">
                Day / Swing 독립 평가 · 실제 완료 봉 · 원본 근거 보존
              </p>
            </div>
            <div className="scan-control">
              <button
                className={running ? "stop" : "primary"}
                onClick={() => {
                  if (running) controller.current?.abort();
                  setRunning((v) => !v);
                }}
              >
                {running ? "■ 스캔 중지" : "▶ 스캔 시작"}
              </button>
              <span aria-live="polite">
                {busy
                  ? progress
                  : running
                    ? "● 자동 갱신 활성"
                    : "○ 대기 · 사용자 실행"}
              </span>
            </div>
          </section>
          <div className="notice">
            점수는 검증 전 가설이며 수익 확률이 아닙니다. 브라우저를 닫으면
            감시가 중단됩니다. 모든 계획은 모의 분석입니다.
          </div>
          <section className="stats">
            <article>
              <span>USDT 무기한 시장</span>
              <strong>{market?.markets.length ?? "—"}</strong>
            </article>
            <article>
              <span>일반 유동성 필터 통과</span>
              <strong>{market ? result.standard.length : "—"}</strong>
            </article>
            <article>
              <span>상세 측정 / 전략별 평가</span>
              <strong>
                {signals.length}
                <small> · {busy ? "분석 중" : "건"}</small>
              </strong>
            </article>
            <article>
              <span>최근 시장 수신</span>
              <strong className="timestamp">
                {market ? time(market.retrievedAt) : "스캔을 시작하세요"}
              </strong>
            </article>
          </section>
          <details className="settings">
            <summary>시장 필터 및 갱신</summary>
            <div className="filter-grid">
              <label>
                최소 24h 거래대금 (USDT)
                <input
                  type="number"
                  min={1000000}
                  value={filters.minVolume}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      minVolume: Math.max(1e6, Number(e.target.value)),
                    })
                  }
                />
              </label>
              <label>
                최대 스프레드 (%)
                <input
                  type="number"
                  min={0}
                  max={0.15}
                  step={0.01}
                  value={filters.maxSpread}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      maxSpread: Math.min(
                        0.15,
                        Math.max(0, Number(e.target.value)),
                      ),
                    })
                  }
                />
              </label>
              <label>
                최소 상장 기간 (일)
                <input
                  type="number"
                  min={14}
                  value={filters.minAge}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      minAge: Math.max(14, Number(e.target.value)),
                    })
                  }
                />
              </label>
              <label>
                갱신 간격
                <select
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                >
                  <option value={5}>5분</option>
                  <option value={10}>10분</option>
                  <option value={15}>15분</option>
                </select>
              </label>
            </div>
            <p className="subtle">
              다음 스캔부터 적용 · 원본 설정은 각 신호에 보존됩니다.
            </p>
          </details>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {market && now - market.retrievedAt > 120000 && (
            <p className="warning">
              시장 수신 자료가 오래되었습니다. 새 진입 판단 전에 스캔을
              갱신하세요.
            </p>
          )}
          {market?.warnings.map((w) => (
            <p className="warning" key={w}>
              {w}
            </p>
          ))}
          <p className="subtle" aria-live="polite">
            {progress}
          </p>
          <div className="workspace">
            <section className="panel markets">
              <div className="panel-heading">
                <h2>후보 TOP 10</h2>
                <select
                  aria-label="전략"
                  value={strategy}
                  onChange={(e) =>
                    setStrategy(e.target.value as Strategy | "all")
                  }
                >
                  <option value="all">전체</option>
                  <option value="day">데이트레이딩</option>
                  <option value="swing">스윙</option>
                </select>
              </div>
              <div className="list-filters">
                <input
                  aria-label="종목 검색"
                  placeholder="종목 검색"
                  value={filters.search}
                  onChange={(e) =>
                    setFilters({ ...filters, search: e.target.value })
                  }
                />
                <label>
                  최소 점수
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={minimum}
                    onChange={(e) => setMinimum(Number(e.target.value))}
                  />
                </label>
                <select
                  aria-label="신호 상태 필터"
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                >
                  <option value="all">모든 상태</option>
                  {[
                    "WATCH",
                    "SETUP",
                    "TRIGGERED",
                    "INVALIDATED",
                    "EXPIRED",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={watchOnly}
                    onChange={(e) => setWatchOnly(e.target.checked)}
                  />{" "}
                  관심만
                </label>
              </div>
              <div className="candidate-list">
                {ranked.slice(0, 10).map((s) => {
                  const current = followSignal(
                    s,
                    market?.markets.find((m) => m.symbol === s.symbol)?.price ??
                      0,
                    now,
                  );
                  const m = (s.raw as Bundle).market;
                  return (
                    <article
                      className={
                        active?.id === s.id ? "candidate selected" : "candidate"
                      }
                      key={s.id}
                    >
                      <button
                        className="candidate-open"
                        onClick={() => select(s)}
                      >
                        <span>
                          <b>{s.symbol}</b>{" "}
                          <small>
                            {s.strategy === "day" ? "DAY" : "SWING"} ·{" "}
                            {current.state}
                          </small>
                        </span>
                        <strong className="score">
                          {s.score}
                          <small> /100</small>
                        </strong>
                        <span>
                          {number(m.price)} USDT{" "}
                          <i className={m.change < 0 ? "negative" : "positive"}>
                            {m.change.toFixed(2)}%
                          </i>
                        </span>
                        <small>
                          거래대금 {(m.quoteVolume / 1e6).toFixed(2)}M · spread{" "}
                          {m.spread?.toFixed(3) ?? "미확인"}% · 충분성{" "}
                          {s.coverage}%
                        </small>
                        {s.factors
                          .filter((f) => f.status === "pass")
                          .slice(0, 2)
                          .map((f) => (
                            <small key={f.id}>
                              ✓ {f.name} · {f.actual}
                            </small>
                          ))}
                        <small>
                          차단 {s.blockers.length}건 · 측정{" "}
                          {time(s.retrievedAt)}
                        </small>
                      </button>
                      <button
                        aria-label={`${s.symbol} 관심 종목`}
                        className="watch-toggle"
                        onClick={async () => {
                          const enabled = !watch.includes(s.symbol);
                          try {
                            await toggleWatch(s.symbol, enabled);
                            setWatch((v) =>
                              enabled
                                ? [...v, s.symbol]
                                : v.filter((x) => x !== s.symbol),
                            );
                          } catch {
                            setMessage("관심 종목 저장 실패");
                          }
                        }}
                      >
                        {watch.includes(s.symbol) ? "★" : "☆"}
                      </button>
                    </article>
                  );
                })}
                {!ranked.length && (
                  <div className="empty">
                    {busy
                      ? "실제 데이터를 분석하고 있습니다."
                      : "스캔을 시작하거나 필터를 조정하세요."}
                  </div>
                )}
              </div>
              <details className="watch">
                <summary>저유동성 관찰 목록 · {result.watch.length}</summary>
                <p>일반 순위·트리거에서 제외</p>
                {result.watch.slice(0, 20).map((m) => (
                  <p key={m.symbol}>
                    {m.symbol} · {(m.quoteVolume / 1e6).toFixed(2)}M USDT
                  </p>
                ))}
              </details>
              <div className="actions benchmark">
                <button onClick={() => void openBenchmark("BTCUSDT")}>
                  BTC 벤치마크
                </button>
                <button onClick={() => void openBenchmark("ETHUSDT")}>
                  ETH 벤치마크
                </button>
              </div>
            </section>
            <section className="panel detail">
              {active ? (
                <>
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">
                        {active.strategy.toUpperCase()} · 원본 분석
                      </p>
                      <h2>
                        {active.symbol}{" "}
                        <span className="badge">{displayState}</span>
                      </h2>
                    </div>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        try {
                          const b = await load<Bundle>(
                            `/api/analysis?symbol=${active.symbol}`,
                            new AbortController().signal,
                          );
                          select(analyze(b, active.strategy, config, risk));
                          setMessage(
                            "현재 시장으로 새 분석을 생성했습니다. 이전 원본 저장 기록은 유지됩니다.",
                          );
                        } catch {
                          setMessage("현재 시장 갱신 실패");
                        }
                      }}
                    >
                      현재 시장 재분석
                    </button>
                  </div>
                  <div className="snapshot-meta">
                    <p>
                      원본 {time(active.createdAt)} · 유효기간{" "}
                      {time(active.expiresAt)} · 원본 상태 {active.state} ·
                      충분성 {active.coverage}%
                    </p>
                    <p>
                      현재 시세{" "}
                      {number(
                        market?.markets.find((m) => m.symbol === active.symbol)
                          ?.price ?? bundle!.market.price,
                      )}{" "}
                      USDT ·{" "}
                      {market ? time(market.retrievedAt) : "저장 당시 자료"} ·
                      코드 {active.codeVersion}
                    </p>
                  </div>
                  <div className="intervals">
                    {intervals.map((i) => (
                      <button
                        key={i}
                        aria-pressed={interval === i}
                        onClick={() => setIntervalValue(i)}
                      >
                        {i === "1d" ? "1D" : i}
                      </button>
                    ))}
                  </div>
                  {candles?.length ? (
                    <Chart
                      candles={candles}
                      symbol={active.symbol}
                      tick={bundle!.market.tickSize}
                      levels={levels}
                      onLevels={setLevels}
                      focusTime={focusTime}
                    />
                  ) : (
                    <div className="empty">이 시간봉은 자료가 없습니다.</div>
                  )}
                  <div className="chart-meta">
                    차트 출처: Binance · 완료 봉만 사용 ·{" "}
                    {candles?.length
                      ? `마지막 마감 ${time(candles.at(-1)!.closeTime)}`
                      : "자료 없음"}
                  </div>
                  <section className="evidence">
                    <h3>점수 근거 · {active.score}/100</h3>
                    {active.factors.map((f) => (
                      <details key={f.id} className={`factor ${f.status}`}>
                        <summary>
                          {f.name}{" "}
                          <b>
                            {f.points}/{f.weight}
                          </b>{" "}
                          <small>
                            {f.status === "unknown"
                              ? "미확인"
                              : f.status === "pass"
                                ? "충족"
                                : "미충족"}
                          </small>
                        </summary>
                        <p>실측: {f.actual}</p>
                        <p>기준: {f.threshold}</p>
                        <p>{f.explanation}</p>
                        <p className="subtle">
                          {f.at ? time(f.at) : "측정 시각 없음"} · {f.source}
                        </p>
                        {f.at && (
                          <button
                            onClick={() => {
                              setFocusTime(f.at!);
                            }}
                          >
                            관련 봉 위치 보기
                          </button>
                        )}
                      </details>
                    ))}
                    <p>
                      <b>트리거 조건:</b> {active.trigger}
                    </p>
                    <p>
                      <b>무효화:</b> {active.invalidation}
                    </p>
                    <p className="warning">
                      {active.blockers.length
                        ? active.blockers.join(" · ")
                        : "안전 조건 충족 · 진입 보장 없음"}
                    </p>
                    <details>
                      <summary>반대 근거와 데이터 공백</summary>
                      {active.opposing.map((r, i) => (
                        <p key={i}>{r}</p>
                      ))}
                      {bundle?.warnings.map((w) => (
                        <p key={w}>{w}</p>
                      ))}
                      <p>
                        손절 돌파 또는 BTC 급등 시 숏 가설이 약화될 수 있습니다.
                      </p>
                    </details>
                    <p className="subtle">{active.levelReason}</p>
                  </section>
                  <Planner
                    levels={levels}
                    risk={risk}
                    tick={bundle!.market.tickSize}
                    bundle={bundle}
                    onLevels={setLevels}
                    onRisk={(r) => {
                      setRisk(r);
                      if (riskSchema.safeParse(r).success)
                        void setPreference("risk", r).catch(() => {});
                    }}
                    onReset={() => setLevels(active.proposed)}
                    onSave={async () => {
                      if (!levels) return;
                      try {
                        await saveScenario(active, levels, risk);
                        setMessage(
                          "시나리오 저장 완료 · 저장 시나리오 탭에서 확인하세요.",
                        );
                      } catch {
                        setMessage(
                          "저장 실패 · 입력과 브라우저 저장 공간을 확인하세요.",
                        );
                      }
                    }}
                  />
                  <Research key={active.id} signal={active} />
                </>
              ) : (
                <div className="empty detail-empty">
                  후보를 선택하면 차트·점수 근거·숏 모의 계획을 확인할 수
                  있습니다.
                </div>
              )}
            </section>
          </div>
        </>
      )}
      <footer>
        <span>ALT SHORT · 가설 기반 연구 도구</span>
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          Charts by TradingView
        </a>
        <span>자동 주문 없음 · 기기 간 동기화 없음</span>
      </footer>
    </main>
  );
}
