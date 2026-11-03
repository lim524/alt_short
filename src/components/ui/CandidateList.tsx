"use client";
import type { CSSProperties } from "react";
import type { SignalSnapshot } from "../../lib/domain";
import Icon from "./Icon";
const price = (n: number) =>
  n.toLocaleString("ko-KR", { maximumFractionDigits: 8 });
export default function CandidateList({
  signals,
  activeId,
  watched,
  busy,
  onSelect,
  onWatch,
}: {
  signals: SignalSnapshot[];
  activeId?: string;
  watched: string[];
  busy: boolean;
  onSelect: (s: SignalSnapshot) => void;
  onWatch: (symbol: string) => void;
}) {
  return (
    <div className="candidate-list" aria-busy={busy}>
      <div className="table-labels" aria-hidden="true">
        <span />
        <span>종목</span>
        <span>현재가</span>
        <span>24h 변동률</span>
        <span>점수 ↓</span>
        <span />
      </div>
      {signals.slice(0, 10).map((s, i) => {
        const m = s.raw.market;
        const reasons = s.factors
          .filter((f) => f.status === "pass")
          .slice(0, 2);
        return (
          <article
            className={activeId === s.id ? "candidate selected" : "candidate"}
            key={s.id}
            style={{ "--row-index": i } as CSSProperties}
          >
            <div className="candidate-row">
              <button
                aria-label={`${s.symbol} 관심 종목`}
                aria-pressed={watched.includes(s.symbol)}
                className="watch-toggle"
                onClick={() => onWatch(s.symbol)}
              >
                <Icon name="star" size={21} />
              </button>
              <button
                className="candidate-open"
                onClick={() => onSelect(s)}
                aria-label={`${s.symbol} ${s.strategy === "day" ? "데이" : "스윙"} 분석 보기`}
              >
                <span className="candidate-asset">
                  <b>
                    {s.symbol.replace("USDT", "")}
                    <span>/USDT</span>
                  </b>
                  <small>
                    {s.strategy === "day" ? "DAY" : "SWING"}
                    <span className="asset-dot" />
                    {s.state}
                  </small>
                </span>
                <span className="candidate-price">{price(m.price)}</span>
                <span
                  className={`candidate-change ${m.change < 0 ? "negative" : "positive"}`}
                >
                  {m.change > 0 ? "+" : ""}
                  {m.change.toFixed(2)}%
                </span>
                <span className="score">{s.score}</span>
                <Icon name="chevron" size={18} />
              </button>
            </div>
            <div className="candidate-reasons">
              {reasons.length > 0 ? (
                reasons.map((f) => (
                  <span key={f.id}>
                    <Icon name="check" size={12} />
                    {f.name}
                  </span>
                ))
              ) : (
                <span>충족 근거 부족 · 관찰 중</span>
              )}
              <span className="coverage">자료 {s.coverage}%</span>
            </div>
          </article>
        );
      })}
      {busy && signals.length === 0 ? (
        <div className="scan-skeleton" aria-label="후보 분석 중">
          {[0, 1, 2].map((i) => (
            <div className="skeleton-row" key={i}>
              <span />
              <span />
              <span />
            </div>
          ))}
          <p>완료된 캔들과 시장 지표를 확인하고 있어요.</p>
        </div>
      ) : signals.length === 0 ? (
        <div className="empty list-empty">
          <span className="empty-icon">
            <Icon name="search" size={26} />
          </span>
          <h3>아직 후보가 없어요</h3>
          <p>
            스캔을 시작하거나 필터를 조정하면
            <br />
            조건에 맞는 종목을 확인할 수 있습니다.
          </p>
        </div>
      ) : null}
    </div>
  );
}
