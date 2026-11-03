"use client";
import { useState } from "react";
import { configSchema, defaultConfig, type ScannerConfig } from "../lib/domain";
export default function Settings({
  config,
  onChange,
}: {
  config: ScannerConfig;
  onChange: (c: ScannerConfig) => void;
}) {
  const [draft, setDraft] = useState(config),
    [error, setError] = useState("");
  return (
    <section className="panel settings-page">
      <h2>전략 설정 · 가설 v{draft.version}</h2>
      <p className="warning">
        점수는 확률이 아닙니다. 임계값은 검증 전 가설이며 전략 성과는 측정되지
        않았습니다.
      </p>
      <div className="form-grid">
        {(
          [
            ["watchScore", "WATCH 기준 점수"],
            ["sellRatio", "매도/매수 비율"],
            ["dayWeakness", "Day 상대 약세 (%p)"],
            ["swingWeakness", "Swing 상대 약세 (%p)"],
            ["dayRR", "Day 최소 순 R:R"],
            ["swingRR", "Swing 최소 순 R:R"],
            ["atrBuffer", "손절 ATR 버퍼"],
            ["candidateLimit", "상세 분석 후보 수 (최대 20)"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              step="any"
              value={draft[key]}
              onChange={(e) =>
                setDraft({ ...draft, [key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
      </div>
      {(["dayWeights", "swingWeights"] as const).map((key) => (
        <fieldset key={key}>
          <legend>
            {key === "dayWeights"
              ? "Day: 추세 / 거부 / 체결 / 상대약세 / OI펀딩"
              : "Swing: 추세 / 상대약세 / 이탈 / OI거래량 / 펀딩시장"}
          </legend>
          <div className="form-grid">
            {draft[key].map((weight, i) => (
              <label key={i}>
                요인 {i + 1}
                <input
                  aria-label={`${key} 요인 ${i + 1}`}
                  type="number"
                  min={0}
                  max={100}
                  value={weight}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [key]: draft[key].map((v, index) =>
                        index === i ? Number(e.target.value) : v,
                      ),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <p className="subtle">
            합계 {draft[key].reduce((a, b) => a + b, 0)} / 100
          </p>
        </fieldset>
      ))}
      <p role="alert">{error}</p>
      <div className="actions">
        <button onClick={() => setDraft(defaultConfig)}>기본 가설 복원</button>
        <button
          className="primary"
          onClick={() => {
            const parsed = configSchema.safeParse(draft);
            if (parsed.success) {
              onChange(parsed.data);
              setError("설정 저장 완료 · 다음 스캔부터 적용됩니다.");
            } else
              setError(parsed.error.issues.map((i) => i.message).join(" / "));
          }}
        >
          설정 저장
        </button>
      </div>
      <h3>데이터 상태와 운영</h3>
      <p className="subtle">
        공개 Binance API 사용 · 상세 후보만 순차 조회. 시세·호가 2분, 상세 호가
        30초, 완료 봉 연속성 검사. OI는 최근 약 1시간 관측이며 이력 제공은 약
        1개월로 제한됩니다. 펀더멘털은 검증된 매핑만 표시합니다. 브라우저가
        닫히면 감시하지 않습니다.
      </p>
    </section>
  );
}
