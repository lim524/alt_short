"use client";
import { pnl, roundTick } from "../lib/planner";
import { fillSlippage } from "../lib/market/indicators";
import type { Levels, Risk, Bundle } from "../lib/domain";
export default function Planner({
  levels,
  risk,
  tick,
  bundle,
  onLevels,
  onRisk,
  onReset,
  onSave,
}: {
  levels: Levels | null;
  risk: Risk;
  tick: number;
  bundle: Bundle | undefined;
  onLevels: (l: Levels) => void;
  onRisk: (r: Risk) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const result = levels ? pnl(levels, risk) : null;
  const slip = bundle?.depth
    ? fillSlippage(bundle.depth.bids, risk.margin * risk.leverage, "sell")
    : null;
  return (
    <section className="planner">
      <h3>숏 모의 시나리오</h3>
      <p className="subtle">알고리즘 원본과 수정 계획은 별도로 보존됩니다.</p>
      {levels ? (
        <div className="form-grid">
          {(["entry", "stop", "tp1", "tp2"] as const).map((key, i) => (
            <label key={key}>
              {["진입 (조건부)", "손절", "TP1", "TP2"][i]}
              <input
                aria-label={
                  ["진입 가격", "손절 가격", "TP1 가격", "TP2 가격"][i]
                }
                type="number"
                step={tick}
                min={tick}
                value={levels[key]}
                onChange={(e) =>
                  onLevels({ ...levels, [key]: Number(e.target.value) })
                }
                onBlur={() =>
                  onLevels({ ...levels, [key]: roundTick(levels[key], tick) })
                }
              />
            </label>
          ))}
        </div>
      ) : (
        <p className="warning">
          구조적 지지가 충분하지 않아 추천값 없음 · 다른 종목을 확인하세요.
        </p>
      )}
      <div className="form-grid">
        {(
          [
            ["margin", "증거금 (USDT)"],
            ["leverage", "레버리지 (1~20x)"],
            ["feeBps", "편도 수수료 (bps)"],
            ["slippageBps", "편도 슬리피지 (bps)"],
            ["fundingPct", "보유기간 펀딩 수취율 (%)"],
            ["tp1Pct", "TP1 배분 (%) · TP2는 나머지"],
            ["account", "총 계좌 (USDT, 0=미입력)"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              aria-label={label}
              type="number"
              step="any"
              value={risk[key]}
              onChange={(e) =>
                onRisk({ ...risk, [key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
      </div>
      <p className="subtle">
        펀딩 양수=숏 수취, 음수=지급. 실제 보유 횟수는 사용자가 가정합니다. 1
        bps = 0.01%.
      </p>
      {result ? (
        <div className="risk-results">
          <span>
            명목금액 <b>{result.notional.toFixed(2)} USDT</b>
          </span>
          <span>
            순 예상 손실{" "}
            <b className="negative">{result.loss.toFixed(3)} USDT</b>
          </span>
          <span>
            TP1 / TP2 순이익{" "}
            <b>
              {result.tp1.toFixed(3)} / {result.tp2.toFixed(3)}
            </b>
          </span>
          <span>
            배분 순이익 <b>{result.reward.toFixed(3)} USDT</b>
          </span>
          <span>
            순 R:R / 총 R:R{" "}
            <b>
              {result.netRR.toFixed(2)} / {result.grossRR.toFixed(2)}
            </b>
          </span>
          <span>
            증거금 수익률 <b>{result.marginReturn.toFixed(2)}%</b>
          </span>
          <span>
            목표 가격 변동 <b>{result.movePct.toFixed(2)}%</b>
          </span>
          <span>
            계좌 위험 <b>{result.accountRisk?.toFixed(2) ?? "미입력"}%</b>
          </span>
        </div>
      ) : (
        <p role="alert" className="error">
          진입 부적합 / 설정 오류: 손절 &gt; 진입 &gt; TP1 ≥ TP2, 양수 가격과
          올바른 비용·배분을 입력하세요.
        </p>
      )}
      <p className="subtle">
        관측 매도 호가 슬리피지:{" "}
        {slip === null ? "자료 없음/깊이 부족" : `${slip.toFixed(3)} bps`} ·{" "}
        {bundle?.depth
          ? new Date(bundle.depth.time).toLocaleString("ko-KR")
          : ""}
        . 호가는 동적이며 지정 가정치를 자동 변경하지 않습니다.
      </p>
      <p className="warning">
        레버리지는 가격 위험을 줄이지 않습니다. 청산 위험이 증가하며 이 계산은
        거래소 청산가가 아닙니다.
      </p>
      <div className="actions">
        <button disabled={!levels} onClick={onReset}>
          추천값 복원
        </button>
        <button
          className="primary"
          disabled={!result || !levels}
          onClick={onSave}
        >
          시나리오 저장
        </button>
      </div>
    </section>
  );
}
