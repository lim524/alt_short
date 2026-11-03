# Binance Alt Short Scanner — Agent Master Plan

> **Purpose:** This document is the source of truth for a coding agent implementing the project. Read it completely before editing code. Do not silently change product requirements or assume that a scoring heuristic is a proven trading strategy.

## 0. Agent operating instructions

You are the lead full-stack engineer and research-minded quant developer for this project. Build a **responsive, on-demand web application** that screens Binance USDT-margined perpetual futures for potential **short-selling setups** across day trading and swing trading. Prioritize reproducibility, explainability, data integrity, user control, and low operating cost over flashy AI output.

Rules:
1. Inspect the existing repository and dependencies first. Preserve working code where sensible; do not rewrite or deploy without necessity.
2. Implement in phases. Before each phase, state files to be changed, verification steps, and any assumptions. At completion, document what works, what is mocked, tests run, and outstanding limitations.
3. Write maintainable TypeScript with clear boundaries and concise Korean comments where helpful. Keep UI labels and user-facing explanations in Korean by default.
4. Never fabricate market data, source citations, indicator values, AI findings, or test results. Clearly label demonstration/mock data.
5. Do **not** place API keys in browser bundles or `NEXT_PUBLIC_*` environment variables. Use server-only environment variables and API routes. Never commit secrets.
6. Do **not** implement automated order placement, trading permissions, or position management on Binance. Read-only market data and simulated plans only.
7. Do **not** implement token-unlock schedule fetching, token-unlock scoring, token-unlock alerts, or AI token-unlock research. The user will research unlocks separately. General circulating supply and FDV may still be displayed as context; do not infer specific unlock events.
8. Treat scoring thresholds and parameters below as **initial test hypotheses, not validated predictions**. Make them configurable. Do not claim a score indicates a calibrated probability.
9. Never generate or update trading recommendations from future candles, unclosed bars masquerading as closed bars, stale data, missing values, or hindsight information.
10. Prefer completing a robust MVP before expanding to optional AI, news, notifications, multi-device sync, or backtesting dashboards.

## 1. Product definition

**Name:** Binance Alt Short Scanner (working title)

**Goal:** Help an individual trader find relatively weak altcoin perpetual futures, inspect clear technical and (optionally) fundamental evidence, interactively set short entry/stop/take-profit lines on a real chart, calculate risk/reward, save a trade scenario, and later review whether the signal worked.

**Target:** Binance USDⓈ-M **USDT-settled perpetual** markets. BTC and ETH should be available as market benchmarks but excluded from the default candidate ranking (configurable if needed).

**Platforms:** Responsive browser-based website accessible through desktop browsers and iPhone Safari; no native application, local Python daemon, PC prerequisite, or app-store release.

**Trigger model:** No 24/7 market monitoring. User enters site and explicitly clicks **스캔 시작**. While the page is actively open, update on a configurable interval (initial target: ~5 minutes) using browser orchestration and on-demand serverless endpoints. **스캔 중지** ends refresh. When browser is backgrounded/suspended (especially iOS), scanning may pause; on focus, explicitly refresh data and signal timestamps. Never promise background monitoring, push alerts, or continuous real-time signal capture when the site is closed.

**Trades:** Analytical and paper-trading scenarios only. No brokerage API credentials, no market orders or automatic trades.

## 2. Mandatory user flow

1. Open website on desktop or iPhone; show `스캔 시작` and last-update status.
2. Choose `데이트레이딩`, `스윙`, or `전체`.
3. Click `스캔 시작`; retrieve Binance market universe, filter and rank candidates.
4. Show TOP candidates with scores, state (`WATCH`, `SETUP`, `TRIGGERED`, `INVALIDATED`, `EXPIRED`), liquidity and **concise reasons**, plus when data was measured.
5. Click a candidate to open real Binance OHLCV chart and detailed explanation of each score component.
6. Display **algorithm-proposed** entry, stop and TP1/TP2 (optional TP3) with risk/reward zones on chart.
7. Let user drag lines on desktop and by touch on iPhone, or edit precise numbers; update margin/leverage, fees, potential losses/profits, net R:R immediately.
8. Optionally click `AI 심층 분석` to read source-grounded fundamental/news context, short thesis, opposing thesis and uncertainty.
9. Save a scenario (separate proposed lines vs edited lines), review previously saved records and update actual/paper outcome without rewriting original evidence.

## 3. Architecture and stack

### 3.1 Preferred stack
- **Next.js + TypeScript + React**: web app, server route handlers for authenticated/secret API access and CORS-safe data proxying.
- **Tailwind CSS**: responsive design; accessible high contrast dark-theme financial UI.
- **TradingView Lightweight Charts**: candlesticks, volume, overlays, marks and custom position graphics.
- **Web Worker** (where helpful): batch indicator computations off the UI thread; avoid long blocking work on iPhones.
- **IndexedDB**: local settings, watchlist, scenarios, snapshots, and cached public data (using a well-supported typed wrapper if appropriate).
- **Optional cloud database / auth (later):** needed if cross-device saved-plan sync is requested. IndexedDB alone **does not synchronize PC and iPhone**.
- **Serverless route handlers:** Binance/CoinGecko/DefiLlama fetch as needed, normalize responses, cache, apply rate limits, and protect secrets. For AI, only server-side requests.
- **Deployment:** GitHub + Vercel or another Next.js-compatible platform. Confirm quotas and response-time constraints; avoid long-running scans inside one serverless function.

### 3.2 Data flow
```
Browser: start scan
  -> Next.js API routes: normalized public-market snapshots (batch, cache, throttle)
  -> Browser/Web Worker: cheap screening & Day/Swing scoring
  -> Selected candidates: detailed Binance bars, OI, funding, trade-flow, book/liquidity
  -> Optional external fundamentals/news retrieval only for top candidates
  -> Optional user-triggered AI reasoning, source-grounded and cached
  -> Chart + editable risk lines + reasons
  -> IndexedDB saved plan + immutable snapshot/log
```

Maintain **data-source adapters** (`binance`, `coingecko`, `defillama`, `news`, `ai`) so invalid/changed upstream responses do not propagate silently. Type-check all external responses (e.g., Zod). Include retry/backoff, expiry timestamps, concurrency limits, and `partial/unavailable` status. Do not download full detailed historical bars for every listed symbol on every scan if lighter filtering can narrow the universe.

### 3.3 API boundaries & security
- Initial MVP should not require Binance trading API keys. Use only public market endpoints.
- CoinGecko Demo key, if used, stays server side; OpenAI API key stays server side.
- DefiLlama public endpoints may be called without a key subject to current provider terms; verify actual endpoint access during implementation.
- Never relay an unrestricted user-supplied URL through a proxy (prevent SSRF). Allowlist upstream domains, paths, supported symbols and bounded query params.
- Apply rate limiting, response caching, output size caps and timeouts; protect AI endpoint against unauthorized public usage (personal-use access control or per-session limits as appropriate).
- Never expose private user scenarios from one session to other users.
- Verify current Binance endpoints, data-retention limits, symbol properties, and request weights against official documentation before writing adapters. Document any API substitutions.

## 4. Sources and coverage

| Data | Primary source | Use and caveats |
|---|---|---|
| USDT perpetual universe, contract status | Binance USDⓈ-M public API | Filter contract type, quote/margin asset, active trading state. |
| Price, OHLCV, 24h quote turnover | Binance | Sort/filter and compute indicators. Distinguish quote turnover from base volume. |
| Spread, book depth | Binance book ticker / order book | Estimate real execution feasibility rather than relying only on 24h turnover. |
| Trade flow / taker imbalance | Binance trade or available taker-volume data | Use explicitly documented time windows, normalizations and coverage. |
| Open interest history/current | Binance futures data | Beware historical availability/window limits; absence is not zero. |
| Funding rate/history | Binance | Funding for short positions can be positive or negative; model sign and timing correctly. |
| BTC comparative returns | Binance OHLCV | Align time windows/time zones with alt returns. |
| Market cap, circulating/total/max supply, FDV | CoinGecko | Match contracts/assets safely; metadata != proof of value. |
| TVL, protocol fees, revenue | DefiLlama | Some tokens have no corresponding protocol or no suitable metric; do not infer project failure from missing metrics. |
| Project announcements / news | Verified official/project publications, permitted news APIs | Show URL, published time, retrieval time; avoid unverifiable claims and unauthorized scraping. |
| AI textual analysis | OpenAI API, optional | Only on supplied structured metrics and verifiable retrieved sources. |

**Token unlocks are explicitly excluded from the entire pipeline.**

Entity mapping must not rely on symbol text alone. Use Binance contract metadata, CoinGecko IDs, chain/contract when available, and verified project linkage. On uncertain mappings mark `미확인`, omit affected fundamental conclusions and give the user a source link for manual review.

## 5. Universe, liquidity and safety filters

Default initial rules (all tunable, persisted locally):
- Include active Binance USDT-margined perpetuals only.
- **24h quote turnover >= 1,000,000 USDT** in normal ranking.
- **500,000–1,000,000 USDT** in a clearly labeled low-liquidity **관찰 목록**; never quietly mix with standard ranking.
- Below 500,000 USDT: exclude by default; allow advanced setting only with explicit warnings.
- Initial listing age >= 14 days if reliable listing date is available; if not, show unknown and handle conservatively.
- Indicative best bid/ask spread <= 0.15% for standard ranking (configurable); independently assess depth and estimated slippage at the user's proposed notional size.
- If recent 5-minute price jumps > +15%, price feeds are stale, spread widens dramatically, or depth is insufficient, do not emit a fresh actionable trigger; show an abnormal-volatility warning.
- Exclude or warn when bars/OI/funding are missing rather than substituting fabricated values.

Liquidity filters depend on **desired order size**. Compute estimated fill slippage at the user-set notional where order book data is available, with a disclaimer that books are dynamic.

## 6. Distinct scanners

### 6.1 Day trading (minutes to same day)
- Primary higher timeframe: 1h; context: 4h; setup: 15m; entry trigger: 5m/15m.
- Initial score components (100 pts total):
  - 1h bearish trend (EMA20 below EMA50, close below EMA20): **25**.
  - 15m failed rebound/rejection: **25**.
  - Taker selling pressure / volume confirmation: **20**.
  - 4h underperformance relative to BTC: **15**.
  - OI/funding context: **15**.
- Tentative examples for testing: taker sell/buy volume >= 1.2; alt 4h return <= BTC 4h return - 2 percentage points.
- Risk/reward threshold to *qualify* a feasible setup: initial **net R:R >= 1.5**; expire unused triggered setup after ~30 minutes.

### 6.2 Swing trading (hours to days)
- Primary higher timeframes: 4h + 1D; setup/entry: 1h + 4h.
- Initial score components (100 pts total):
  - 4h/1D bearish structure: **30**.
  - 3–7d relative weakness vs BTC: **25**.
  - Support break and failed retest: **20**.
  - OI/volume structure: **15**.
  - Funding and market regime: **10**.
- Tentative example: 7d alt relative return <= BTC return - 5 percentage points.
- Initial net R:R target >= **2.0**; expire unused triggered setup after ~4 hours.

### 6.3 Score definition and state machine
- Calculate each component deterministically with explicit actual readings, thresholds, weights, passed/failed/unknown status, and contributing candle timestamps.
- Do not collapse missing data into a favorable score. Design `not_scored`/coverage metrics and an explicit **데이터 충분성** display.
- Default `WATCH` threshold: ~70/100; do not automatically treat score 85+ as a recommendation to enter.
- `WATCH` -> `SETUP` -> `TRIGGERED` -> `INVALIDATED` or `EXPIRED` (log all transitions). Triggers require **completed bar confirmation** and a feasible entry/R:R. Alerts should be deduplicated within strategy/symbol/timeframe.
- Market regime warning: significant BTC surge, unusual volatility, spread or news events may suppress **new triggers** without suppressing factual observations.
- OI or positive funding alone is **not** a bearish signal. Changes in OI have multiple interpretations; describe them with price, volume, funding and context.
- Maintain versioned scoring rules and parameters so historical signals remain interpretable.

## 7. Chart and manual short-position planning

Use live actual OHLCV (not pretend or cosmetically reconstructed candles). Support 5m, 15m, 1h, 4h, 1D, volume and toggleable EMA, ATR, major support/resistance.

Draw editable horizontal lines:
- **Entry**: yellow/gold.
- **Stop-loss**: red.
- **TP1 / TP2 / optional TP3**: green variants.
- Highlight prospective risk (red) / reward (green) regions and current price.
- Display reason-linked annotations for structural resistance, support break, retest failure and swing high. Clicking a reason should focus the relevant chart time/area if evidence supports the annotation.

Initial proposed levels:
- Entry: conditional trigger price or user chosen price (distinguish hypothetical vs actual).
- Stop: above recent structural swing high plus configurable ATR buffer; avoid mechanically tight stops.
- TP: meaningful support levels plus R-multiple reference targets. Never invent support levels or force an attractive R:R if chart structure doesn't justify them.
- If no viable net R:R or invalid position geometry, label `진입 부적합 / 설정 오류` instead of inventing a trade.

Interactions:
- Desktop: drag price labels/lines; iPhone: touch drag handles with large targets and **edit/lock** toggle to prevent conflict with chart pan/zoom. Numeric inputs remain available as accessible fallback.
- A `추천값 복원` control restores original proposed levels while preserving immutable original suggestion.
- User adjusts margin, leverage **1x/2x default**, fee estimates, slippage, expected funding and partial TP percentages (sum 100%).
- Shorts require stop > entry > TP for a standard short plan. Show error if violated. Match exchange tick/step constraints when displaying order-like precision.
- Compute price move %, estimated PnL in USDT, return on margin, gross and **net** R:R and total account risk when account size is supplied. Include fees for entry and exit, estimated slippage and expected funding, showing assumptions/uncertainty.
- Leverage changes margin return and liquidation exposure, not the underlying per-unit price risk. Show liquidation risk warning; do not present a rough liquidation estimate as an exact exchange liquidation price.

## 8. AI reasoning — optional, evidence-grounded

AI is a **research assistant and second-opinion analyst**, not the deterministic scoring/calculation engine and not a guaranteed price predictor.

When user clicks `AI 심층 분석` (initially on only a few top candidates):
1. Fetch limited verified/project-linked CoinGecko and DefiLlama statistics and relevant official/reliable current announcements where available.
2. Supply an explicit structured snapshot of current technical readings, funding, OI, liquidity, timestamp, source URLs and missing-data flags.
3. Ask model for Korean structured output:
   - short thesis and why the signal is being watched;
   - project fundamentals and token utility (where defensible);
   - concrete supporting measured metrics with period/source;
   - credible alternative/bullish/short-squeeze scenario;
   - what evidence would invalidate thesis;
   - uncertainty and stale/unknown data;
   - no unsupported numeric price forecast.
4. Parse/validate output schema. Verify that claimed quantitative values are present in input and sources are actual retrieved references. If not verified, drop/flag claim.
5. Show **AI analysis separately** from deterministic points; never let AI silently modify technical score, stop or TP lines.
6. Cache with analysis timestamp and underlying data snapshot. Reanalysis creates a new historical version, not a mutation of past conclusions.

If `OPENAI_API_KEY` is missing, the scanner, chart, scoring, risk planner and history **must continue to work normally**; show AI as unavailable/optional.

Do not call AI for every asset at every 5-minute refresh. Cost guardrails: top 3–5 on demand, visible usage limits, response caps, caching.

## 9. Explainability and immutable decision records — critical

**Every displayed score or trade plan must include its reasoning.** Do not display only a mysterious 0–100 number.

### 9.1 At signal time persist
- `signal_id`, `symbol`, contract identifier, `strategy` (`day`/`swing`), `signal_state`, `created_at_utc`, bar close time, market data retrieval time and freshness.
- Strategy config version, parameters, thresholds and algorithm/code version.
- Raw or reproducible indicator snapshot: EMA/ATR, relative performance vs BTC, taker imbalance, price/volume, OI and funding details as actually available, liquidity metrics and unknown flags.
- Score breakdown per factor: weight, actual value, comparison, pass/fail/unknown, points awarded, human-readable explanation.
- Algorithm-generated **supporting and opposing evidence**, conditions needed for trigger, invalidation rule and signal expiry.
- Proposed entry/stop/TP and the exact explanation/levels (e.g., swing high + ATR buffer), fee/slippage/funding assumptions.
- If AI analysis exists: model, analysis timestamp, input snapshot or hash, retrieved source URLs + publication dates, structured output, data gaps and confidence caveats.
- User edits saved separately from original algorithm suggestion; never overwrite original market/AI observations.
- Outcome/paper-trade status and actual future price results in a **separate follow-up record**. Never retroactively rewrite past reasoning to appear foresighted.

### 9.2 UI requirements
- Show factors with **actual numeric metric, time window, threshold, awarded score and why**.
- Show unmet reasons and what would falsify the bearish thesis.
- Let user click relevant price-pattern evidence to locate bar/price on chart.
- Provide `원본 분석` vs `현재 시장` and `사용자 수정 계획` views.
- No source available = `자료 없음/검증 불가`, never a fabricated explanation.

### 9.3 Storage caveat
For MVP, browser IndexedDB is local to each origin+device and may be cleared by the user or browser. Provide JSON export/import or backup for saved plans. **No cross-device sync promise** until authentication+server-side DB are added as a separate approved phase. If permanent retention or multi-device continuity becomes mandatory, propose a small database with access control and gain approval before expanding architecture.

## 10. UI pages and components

1. **Home / scanner dashboard**
   - Scan start/stop, status, last refresh, Day/Swing/All tabs, configurable thresholds.
   - BTC regime summary, number of screened symbols, number of candidates, unknown-data warnings.
   - Ranked candidate list: symbol, price, 24h return, turnover, strategy score, state, liquidity, last signal timestamp, **top 2–3 explicit reasons**.
   - Default top 10; filters for liquidity, category, minimum score, state, relative performance.
2. **Symbol detail**
   - Real chart and timeframes.
   - Algorithm scores + inspectable reasons.
   - OI, funding and volume context with time/data provenance.
   - Editable short position planning panel with live R:R.
   - Optional separate AI evidence panel and source links.
   - Save plan and view historic signal versions.
3. **Saved plans / history**
   - Watchlist, custom line levels, creation data, scenario/paper status.
   - Original snapshot vs latest prices, and outcomes without future leakage.
   - JSON export/import, no assumption of phone/PC sync.
4. **Settings & data health**
   - Trading style, universe/turnover threshold, high-risk watch band, score weights, leverage/risk assumptions, update interval.
   - Provider status, cache age, errors, API limitations and missing credentials.
   - Strong visual difference between real data, stale data and demo mode.

Mobile: full-screen chart option, sticky important controls, accessible drag targets, numeric edit fallback, no hover-only interactions.

## 11. Testing and quantitative validation

### 11.1 Engineering tests
- Unit tests: EMA, ATR, benchmark alignment, score factor evaluation, invalid/missing data, short position math, fees and funding sign.
- API adapter tests: expected shape, contract filtering, malformed/partial response, rate-limit and timeout paths, duplicate symbols/project mapping.
- Chart/interaction tests: line drag, tick rounding, touch edit lock, negative/invalid levels, TP allocation sum, restore original.
- Persistence tests: immutable signal snapshot, separate edited plans, record versioning, JSON export/import.
- E2E: user can open page, scan with mock fixtures, inspect reasons, edit prices, save/reopen on mobile viewport.
- Never require paid AI access for core CI tests; mock AI and external APIs in automated tests.

### 11.2 Strategy validation
- Historical replay with **closed bars**, realistically available historical data, no look-ahead bias, explicit symbol survivorship/delisting limitations, trade signal time separated from execution time.
- Net performance includes fees, slippage and plausible funding; classify outcomes conservatively when both SL and TP may hit in the same OHLC bar.
- Evaluate Day and Swing **separately**: win rate, average win/loss, expectancy, net returns, profit factor, drawdown, number of signals, MAE/MFE, regime splits, liquidity tier.
- Use train/validation/out-of-sample chronological splits; do not tune on test period.
- Compare (A) technical-only, (B) technical + fundamental, and (C) technical + fundamental + AI, **without claiming AI boosts performance before controlled evidence**.
- Paper-trading results are separate from backtests and should be followed long enough to cover a diverse sample; 2–4 weeks is a trial window, not proof of edge.

## 12. Implementation roadmap and phase gates

### Phase 0 — Inspect repository and scaffold
- Review existing repo, routes, conventions, deployment. Define modules and schemas (`MarketSymbol`, `Candle`, `MetricEvidence`, `ScanScore`, `SignalSnapshot`, `PositionPlan`, `AiResearchReport`).
- Create `.env.example`, README, API docs/notes, testing setup.
- **Gate:** app runs, no secrets in repo, mocks clearly identified.

### Phase 1 — Real public market data + responsive chart
- Binance universe and 24h quote turnover; symbol filters; real OHLCV for 5m/15m/1h/4h/1D; market health and loading/errors.
- Build chart component with real candles, switching symbols/timeframes, basic volume.
- **Gate:** real, timestamped candles viewable on desktop and iPhone. API limitations documented.

### Phase 2 — Day/Swing deterministic scanner and reasoning
- Indicator pipeline, market filters, separate scoring and factor-level reasons, state transitions, top lists, config.
- Optimize staged fetch, concurrency/rate limits, Web Worker if needed.
- **Gate:** reproducible scores with cited metric provenance; correct missing-data behavior; tested signals.

### Phase 3 — Interactive short planner
- Proposed levels, SL/TP1/TP2/optional TP3, editable chart handles and numeric fields, touch lock, risk/reward and net-fee math, proposed vs edited state.
- **Gate:** editing levels updates risk figures correctly on desktop and iPhone; geometry and precision tests pass.

### Phase 4 — Snapshots and paper scenarios
- IndexedDB saved plans and immutable reasoning snapshots; history, status, exports/imports, follow-up results.
- **Gate:** records survive refresh and retain original data; outcomes do not overwrite past reasons.

### Phase 5 — Fundamentals and optional AI
- Safe asset mapping; CoinGecko/DefiLlama adapters; missing coverage display; optional current verified news; on-demand AI grounded report.
- **Gate:** no unsupported statements, citations and timestamps visible; works without AI key.

### Phase 6 — Deployment and validation
- Vercel deploy, mobile performance, security review, API quota/timeout audit, complete end-to-end tests and an evidence-driven paper-testing plan.
- **Gate:** production site works on both devices with user-invoked scanning; cost/rate-limit caveats documented.

Do not start next phase just because files were generated: run its specified checks and report evidence. Do not claim full system is complete if live external data/CI/mobile tests are unverified.

## 13. Suggested repository structure

```text
src/
  app/
    page.tsx                      # Main scanner
    symbol/[symbol]/page.tsx      # Detail chart and evidence
    plans/page.tsx                # Saved scenarios
    settings/page.tsx
    api/
      market/route.ts             # Server-side market data proxy
      fundamentals/route.ts      # On-demand provider data
      ai-analysis/route.ts       # Optional AI, server only
  components/
    scanner/
    charts/
    position-planner/
    evidence/
  lib/
    providers/
      binance.ts
      coingecko.ts
      defillama.ts
    market/
      indicators.ts
      liquidity.ts
      symbol-mapping.ts
    scanner/
      day.ts
      swing.ts
      scoring.ts
      state-machine.ts
    planner/
      levels.ts
      pnl.ts
    evidence/
      schemas.ts
      formatting.ts
    storage/
      indexeddb.ts
  workers/
    scan.worker.ts
  types/
  tests/
.env.example
README.md
plan.md
```

Adjust directories to existing repo conventions rather than duplicating an established architecture.

## 14. Definition of done — overall

The project is functionally complete only when:
1. Both desktop and iPhone browsers can launch a scan by user action and stop it.
2. Scanner processes real Binance USDT perpetuals with configurable liquidity thresholds and correctly separates day/swing rankings.
3. Every score and signal includes concrete measured reasons, unknown flags and timestamps.
4. A selected symbol displays authentic Binance candles and proposed short entry/stop/TP lines.
5. Lines can be edited by mouse or touch (numeric fallback), and net PnL/R:R updates correctly.
6. Original algorithm data and user edits can be saved separately and revisited.
7. AI reports, if enabled, provide verified source URLs, data/analysis dates, both sides of the trade and explicit uncertainty; no AI key means graceful disable.
8. No token unlock feature, no auto-execution of trades, no secret exposure, no pretend data in production.
9. Core tests and desktop/mobile manual acceptance tests have been executed and their results recorded.
10. README documents install, run, provider keys, local storage limitations, deployment, and rate-limit/cost assumptions.

## 15. First instruction to agent

**Start with Phase 0 and Phase 1 only.** Inspect the repository, propose the smallest coherent implementation, and build a real Binance market-data connection plus responsive candlestick chart. Do not rush to AI, trading signals, or advanced chart editing before basic live data, market filtering, and error handling are verified. At the end, clearly report completed features, files changed, how to run, tests run, anything requiring the user's setup, and the next phase.
