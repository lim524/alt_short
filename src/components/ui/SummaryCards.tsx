"use client";
import { useId } from "react";
import Icon from "./Icon";
function CardArt({ kind }: { kind: "scan" | "watch" | "history" }) {
  const gradientId = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 260 140"
      className={`card-art art-${kind}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1">
          <stop
            stopColor={
              kind === "scan"
                ? "#ffb1b7"
                : kind === "watch"
                  ? "#9cc5ff"
                  : "#d5d7dd"
            }
            stopOpacity="0"
          />
          <stop
            offset="1"
            stopColor={
              kind === "scan"
                ? "#ff858e"
                : kind === "watch"
                  ? "#8abaff"
                  : "#d1d3da"
            }
          />
        </linearGradient>
      </defs>
      {kind === "history" ? (
        <path
          d="M45 140c12-31 39-43 65-28 7-35 41-50 68-29 23-44 61-38 82-12v69Z"
          fill={`url(#${gradientId})`}
        />
      ) : (
        <path
          d={
            kind === "scan"
              ? "M0 66 31 81 65 49 97 75 131 58 165 91 197 84 233 114 260 123V140H0Z"
              : "M0 140 29 120 57 96 87 102 120 71 147 81 183 41 212 48 244 20 260 22V140Z"
          }
          fill={`url(#${gradientId})`}
        />
      )}
    </svg>
  );
}
export default function SummaryCards({
  candidates,
  watchCount,
  historyCount,
  onScan,
  onWatch,
  onHistory,
}: {
  candidates: number | null;
  watchCount: number;
  historyCount: number;
  onScan: () => void;
  onWatch: () => void;
  onHistory: () => void;
}) {
  return (
    <section className="summary-grid" aria-label="분석 현황">
      <button className="summary-card card-scan" onClick={onScan}>
        <span className="card-label">
          숏 후보
          <Icon name="arrow" size={17} />
        </span>
        <strong key={candidates}>
          {candidates ?? "—"}
          <small>개</small>
        </strong>
        <span className="card-caption">기준 점수 이상 · Day / Swing</span>
        <CardArt kind="scan" />
      </button>
      <button className="summary-card card-watch" onClick={onWatch}>
        <span className="card-label">
          관심 종목
          <Icon name="arrow" size={17} />
        </span>
        <strong key={watchCount}>
          {watchCount}
          <small>개</small>
        </strong>
        <span className="card-caption">내가 저장한 관심 목록</span>
        <CardArt kind="watch" />
      </button>
      <button className="summary-card card-history" onClick={onHistory}>
        <span className="card-label">
          분석 기록
          <Icon name="arrow" size={17} />
        </span>
        <strong key={historyCount}>
          {historyCount}
          <small>개</small>
        </strong>
        <span className="card-caption">보관한 모의 시나리오</span>
        <CardArt kind="history" />
      </button>
    </section>
  );
}
