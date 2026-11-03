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
import AppShell, { type Section } from "./ui/AppShell";
import Icon from "./ui/Icon";
import SummaryCards from "./ui/SummaryCards";
import CandidateList from "./ui/CandidateList";
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
  const [tab, setTab] = useState<Section>("overview"),
    [running, setRunning] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [historyCount, setHistoryCount] = useState(0);
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
    setTab((current) =>
      current === "history" || current === "settings" ? "scan" : current,
    );
    setFocusTime(undefined);
  }, []);
  useEffect(() => {
    let alive = true;
    setNow(Date.now());
    void Promise.all([
      list<{ id: string; value: unknown }>("settings"),
      list<{ id: string }>("watchlist"),
      list<SignalSnapshot>("signals"),
    ])
      .then(([prefs, watched, saved]) => {
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
        setHistoryCount(saved.length);
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
  useEffect(() => {
    let alive = true;
    list<SignalSnapshot>("signals")
      .then((rows) => {
        if (alive) setHistoryCount(rows.length);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tab]);
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
  function navigate(section: Section) {
    setTab(section);
    setWatchOnly(section === "watchlist");
  }
  function toggleScan() {
    if (running) controller.current?.abort();
    setRunning((v) => !v);
  }
  async function changeWatch(symbol: string) {
    const enabled = !watch.includes(symbol);
    try {
      await toggleWatch(symbol, enabled);
      setWatch((v) =>
        enabled ? [...v, symbol] : v.filter((x) => x !== symbol),
      );
    } catch {
      setMessage("관심 종목 저장 실패");
    }
  }
  const titles: Record<Section, string> = {
    overview: "대시보드",
    scan: "시장 스캔",
    watchlist: "관심 종목",
    history: "분석 기록",
    settings: "설정",
  };
  const scanButton = (
    <button
      className={running ? "scan-button stop" : "scan-button primary"}
      onClick={toggleScan}
      aria-label={running ? "■ 스캔 중지" : "▶ 스캔 시작"}
    >
      <Icon name={running ? "stop" : "play"} size={20} />
      <span>{running ? "스캔 중지" : "스캔 시작"}</span>
    </button>
  );
  return (
    <AppShell section={tab} onNavigate={navigate} running={running}>
      <header className="page-heading">
        <div>
          <p className="eyebrow">YOUR DAILY MARKET PERSPECTIVE</p>
          <h1>
            <span className="desktop-title">{titles[tab]}</span>
            <span className="mobile-title">
              {tab === "overview" ? (
                <>
                  오늘의
                  <br />숏 기회 찾기<span className="title-period">.</span>
                </>
              ) : (
                titles[tab]
              )}
            </span>
          </h1>
          <p className="page-description">
            {tab === "history"
              ? "관찰의 근거와 내가 세운 계획을 다시 살펴보세요."
              : tab === "settings"
                ? "나의 분석 기준과 위험 가정을 설정하세요."
                : tab === "watchlist"
                  ? "관심 있는 종목의 흐름과 근거를 모아보세요."
                  : "시장 데이터와 기술적 지표로 약세의 근거를 확인하세요."}
          </p>
        </div>
        {tab !== "settings" && tab !== "history" && (
          <div className="heading-controls">
            <label className="strategy-select">
              <span className="sr-only">전략</span>
              <select
                aria-label="전략"
                value={strategy}
                onChange={(e) =>
                  setStrategy(e.target.value as Strategy | "all")
                }
              >
                <option value="all">전체 전략</option>
                <option value="swing">스윙 (수일 ~ 수주)</option>
                <option value="day">데이 (당일)</option>
              </select>
            </label>
            {scanButton}
          </div>
        )}
      </header>
      <p role="status" className={message ? "feedback-message" : "sr-only"}>
        {message}
      </p>
      <div className="page-body" key={tab}>
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
            <SummaryCards
              candidates={
                market
                  ? signals.filter((s) => s.score >= config.watchScore).length
                  : null
              }
              watchCount={watch.length}
              historyCount={historyCount}
              onScan={() => {
                navigate("scan");
                document
                  .getElementById("scanner-workspace")
                  ?.scrollIntoView({ block: "start" });
              }}
              onWatch={() => navigate("watchlist")}
              onHistory={() => navigate("history")}
            />
            <div className="market-toolbar">
              <div className="market-health">
                <span
                  className={
                    busy
                      ? "status-dot working"
                      : market
                        ? "status-dot on"
                        : "status-dot"
                  }
                />
                <strong>Binance Futures</strong>
                <span className="toolbar-divider" />
                {market ? (
                  <span>
                    {market.markets.length}개 시장 · {result.standard.length}개
                    필터 통과
                  </span>
                ) : (
                  <span>실제 데이터 연결 대기</span>
                )}
              </div>
              <div className="toolbar-right">
                <span className="last-update">
                  {market
                    ? `최근 수신 ${time(market.retrievedAt)}`
                    : "사용자 실행 시 데이터를 불러옵니다"}
                </span>
              </div>
            </div>
            {running && (
              <div
                className={busy ? "scan-status scanning" : "scan-status"}
                aria-live="polite"
              >
                <span className="scan-status-icon">
                  <Icon name={busy ? "refresh" : "check"} size={17} />
                </span>
                <span>
                  {busy
                    ? progress || "시장을 불러오고 있어요…"
                    : `${minutes}분마다 갱신합니다 · 페이지가 열려 있을 때만 동작해요.`}
                </span>
                <span className="scan-status-label">
                  {busy ? "ANALYZING" : "ACTIVE"}
                </span>
              </div>
            )}
            <details className="settings market-settings">
              <summary>
                <Icon name="sliders" size={16} /> 시장 필터 및 갱신
                <span className="filter-summary">
                  거래대금 {(filters.minVolume / 1e6).toFixed(1)}M 이상 · spread{" "}
                  {filters.maxSpread}% 이하
                </span>
                <Icon name="chevron" size={15} />
              </summary>
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
                다음 스캔부터 적용되며 원본 설정은 각 신호에 보존됩니다.
              </p>
            </details>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {market && now - market.retrievedAt > 120000 && (
              <p className="warning">
                이전 수신 자료입니다. 새 진입 판단 전에 스캔을 갱신하세요.
              </p>
            )}
            {market?.warnings.map((w) => (
              <p className="warning" key={w}>
                {w}
              </p>
            ))}
            <div className="workspace" id="scanner-workspace">
              <section className="panel markets">
                <div className="panel-heading list-heading">
                  <div>
                    <p className="eyebrow">MARKET WATCH</p>
                    <h2>
                      {tab === "watchlist"
                        ? "관심 종목 리스트"
                        : "오늘의 숏 리스트"}
                    </h2>
                  </div>
                  <div
                    className="strategy-tabs"
                    role="group"
                    aria-label="목록 전략"
                  >
                    {(["all", "swing", "day"] as const).map((s) => (
                      <button
                        key={s}
                        aria-pressed={strategy === s}
                        onClick={() => setStrategy(s)}
                      >
                        {s === "all" ? "전체" : s === "swing" ? "스윙" : "데이"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="list-controls">
                  <label className="search-field">
                    <Icon name="search" size={16} />
                    <input
                      aria-label="종목 검색"
                      placeholder="종목 검색"
                      value={filters.search}
                      onChange={(e) =>
                        setFilters({ ...filters, search: e.target.value })
                      }
                    />
                  </label>
                  <details className="advanced-filters">
                    <summary>
                      <Icon name="sliders" size={16} />
                      <span>상세 필터</span>
                    </summary>
                    <div className="advanced-filter-body">
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
                      <label>
                        신호 상태
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
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={watchOnly}
                          onChange={(e) => setWatchOnly(e.target.checked)}
                        />{" "}
                        관심 종목만
                      </label>
                    </div>
                  </details>
                </div>
                <CandidateList
                  signals={ranked.map((s) =>
                    followSignal(
                      s,
                      market?.markets.find((m) => m.symbol === s.symbol)
                        ?.price ?? 0,
                      now,
                    ),
                  )}
                  activeId={active?.id}
                  watched={watch}
                  busy={busy}
                  onSelect={(s) =>
                    select(
                      signals.find((original) => original.id === s.id) ?? s,
                    )
                  }
                  onWatch={(symbol) => void changeWatch(symbol)}
                />
                <div className="list-bottom">
                  <span>
                    {Math.min(ranked.length, 10)}개 표시 · 점수는 확률이
                    아닙니다
                  </span>
                  <span>TOP 10</span>
                </div>
                <details className="watch">
                  <summary>
                    저유동성 관찰 목록 <span>{result.watch.length}</span>
                  </summary>
                  <p>일반 순위·트리거에서 제외합니다.</p>
                  {result.watch.slice(0, 20).map((m) => (
                    <p key={m.symbol}>
                      {m.symbol} · {(m.quoteVolume / 1e6).toFixed(2)}M USDT
                    </p>
                  ))}
                </details>
                <div className="actions benchmark">
                  <span>시장 벤치마크</span>
                  <button onClick={() => void openBenchmark("BTCUSDT")}>
                    BTC <Icon name="arrow" size={13} />
                  </button>
                  <button onClick={() => void openBenchmark("ETHUSDT")}>
                    ETH <Icon name="arrow" size={13} />
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
                          {active.symbol.replace("USDT", "")}
                          <span className="quote-asset"> / USDT</span>{" "}
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
                    <div className="detail-quote">
                      <strong>{number(bundle!.market.price)}</strong>
                      <span
                        className={
                          bundle!.market.change < 0 ? "negative" : "positive"
                        }
                      >
                        {bundle!.market.change > 0 ? "+" : ""}
                        {bundle!.market.change.toFixed(2)}%
                      </span>
                      <small>원본 측정 시세</small>
                    </div>
                    <details className="snapshot-meta">
                      <summary>
                        원본 분석 정보 <Icon name="chevron" size={12} />
                      </summary>
                      <p>
                        원본 {time(active.createdAt)} · 유효기간{" "}
                        {time(active.expiresAt)} · 원본 상태 {active.state} ·
                        충분성 {active.coverage}%
                      </p>
                      <p>
                        현재 시세{" "}
                        {number(
                          market?.markets.find(
                            (m) => m.symbol === active.symbol,
                          )?.price ?? bundle!.market.price,
                        )}{" "}
                        USDT ·{" "}
                        {market ? time(market.retrievedAt) : "저장 당시 자료"} ·
                        코드 {active.codeVersion}
                      </p>
                    </details>
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
                    <a className="analysis-callout" href="#score-evidence">
                      <span className="callout-icon">
                        <Icon name="sparkle" size={23} />
                      </span>
                      <div>
                        <strong>분석 요약</strong>
                        <p>
                          {active.supporting[0] ??
                            "충족된 약세 근거가 부족합니다. 요인별 미확인 항목을 확인하세요."}
                        </p>
                        <small>
                          {active.blockers.length
                            ? `진입 판단 차단 요인 ${active.blockers.length}개 · 자세한 근거 확인`
                            : "기준 충족은 진입을 보장하지 않습니다 · 자세한 근거 확인"}
                        </small>
                      </div>
                      <Icon name="chevron" size={18} />
                    </a>
                    <section className="evidence" id="score-evidence">
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
                          손절 돌파 또는 BTC 급등 시 숏 가설이 약화될 수
                          있습니다.
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
                          setHistoryCount(
                            (await list<SignalSnapshot>("signals")).length,
                          );
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
                  <div className="detail-placeholder">
                    <div className="placeholder-caption">
                      <span className="eyebrow">A CLOSER LOOK</span>
                      <span className="badge">BINANCE · USDT</span>
                    </div>
                    <div className="empty detail-empty">
                      <span className="empty-icon">
                        <Icon name="history" size={30} />
                      </span>
                      <h2>
                        흐름을 조금 더<br />
                        자세히 살펴보세요.
                      </h2>
                      <p>
                        리스트에서 종목을 선택하면 실제 차트와
                        <br />
                        분석 근거, 모의 계획을 한곳에서 볼 수 있어요.
                      </p>
                      <span className="placeholder-step">
                        <span>01</span> 스캔 시작{" "}
                        <Icon name="arrow" size={14} />
                        <span>02</span> 종목 선택
                      </span>
                    </div>
                    <div className="placeholder-note">
                      <Icon name="shield" size={18} />
                      <span>
                        실제 완료 봉으로 분석합니다.
                        <br />
                        <small>
                          데이터를 불러오기 전에는 차트를 표시하지 않습니다.
                        </small>
                      </span>
                    </div>
                  </div>
                )}
              </section>
            </div>
            <div className="scan-summary">
              <p className="subtle" aria-live="polite">
                {progress ||
                  "전체 시장을 필터링한 뒤 선택된 후보의 지표를 상세 분석합니다."}
              </p>
              <span>완료 봉 기준 · 원본 근거 보존</span>
            </div>
            <div className="bottom-scan">
              <button
                className={running ? "primary stop" : "primary"}
                onClick={toggleScan}
              >
                <Icon name={running ? "stop" : "play"} size={23} />
                {running ? "스캔 중지" : "전체 스캔 시작"}
              </button>
              <p>점수는 검증 전 가설이며 모든 계획은 모의 분석입니다.</p>
            </div>
          </>
        )}
      </div>
      <footer>
        <span>
          Short Scanner<span className="footer-dot">·</span>Read the market.
          Keep the evidence.
        </span>
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          Charts by TradingView ↗
        </a>
        <span>모의 분석 전용 · 자동 주문 없음</span>
      </footer>
    </AppShell>
  );
}
