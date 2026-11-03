"use client";
import { useEffect, useState } from "react";
import { list, saveResearch, type ResearchRecord } from "../lib/storage";
import type { SignalSnapshot } from "../lib/domain";
import type { Fundamentals } from "../lib/providers/fundamentals";
import { researchLabels, type reportSchema } from "../lib/research";
import type { z } from "zod";
type Report = {
  id: string;
  model: string;
  analyzedAt: number;
  inputHash: string;
  report: z.infer<typeof reportSchema>;
  invalidation: string;
  input: {
    evidence: { id: string; actual: string }[];
    fundamentals: Fundamentals;
  };
  sources: Fundamentals["sources"];
};
export default function Research({ signal }: { signal: SignalSnapshot }) {
  const [fundamentals, setFundamentals] = useState<Fundamentals>(),
    [report, setReport] = useState<Report>(),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [available, setAvailable] = useState<boolean | null>(null),
    [versions, setVersions] = useState<ResearchRecord[]>([]);
  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    fetch("/api/ai-analysis", { signal: ac.signal })
      .then((r) => r.json())
      .then((data) => {
        if (alive) setAvailable(data.available === true);
      })
      .catch(() => {
        if (alive) setAvailable(false);
      });
    list<ResearchRecord>("research")
      .then((rows) => {
        if (alive) setVersions(rows.filter((r) => r.signalId === signal.id));
      })
      .catch(() => {});
    return () => {
      alive = false;
      ac.abort();
    };
  }, [signal.id]);
  async function research(ai: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(
        ai ? "/api/ai-analysis" : `/api/fundamentals?symbol=${signal.symbol}`,
        ai
          ? {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                symbol: signal.symbol,
                strategy: signal.strategy,
              }),
            }
          : undefined,
      );
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      if (ai) {
        setReport(data);
        try {
          await saveResearch(signal, data);
          setVersions(
            (await list<ResearchRecord>("research")).filter(
              (r) => r.signalId === signal.id,
            ),
          );
        } catch {
          setMessage(
            "분석은 생성되었지만 기기 저장 실패. JSON 보관을 사용하세요.",
          );
        }
      } else setFundamentals(data);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "자료 없음");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="research">
      <h3>펀더멘털 · 별도 AI 의견</h3>
      {versions.length > 0 && (
        <label>
          보관된 AI 분석 버전
          <select
            defaultValue=""
            onChange={(e) => {
              const version = versions.find((v) => v.id === e.target.value);
              if (version) setReport(version.data as Report);
            }}
          >
            <option value="" disabled>
              버전 선택
            </option>
            {versions.map((v, i) => (
              <option value={v.id} key={v.id}>
                v{i + 1} · {new Date(v.at).toLocaleString("ko-KR")}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="subtle">
        검토된 매핑: BTC / ETH / SOL / AAVE. 매핑 미확인·자료 누락은 결론에서
        제외합니다. AI는 최신 자료를 다시 측정하며 기본 전략 설정으로 별도
        분석합니다.
      </p>
      <button disabled={busy} onClick={() => void research(false)}>
        펀더멘털 조회
      </button>
      {fundamentals && (
        <div>
          <p>
            프로젝트 연결:{" "}
            {fundamentals.mapping === "verified"
              ? "검증됨 (검토된 ID·공식 홈페이지·해당 계약)"
              : "미확인"}
          </p>
          <div className="risk-results">
            {Object.entries(fundamentals.metrics).map(([key, value]) => (
              <span key={key}>
                {(
                  {
                    marketCapUSD: "시가총액 (USD)",
                    fdvUSD: "완전희석가치 (USD)",
                    circulatingSupply: "유통 공급량",
                    totalSupply: "총 공급량",
                    maxSupply: "최대 공급량",
                    tvlUSD: "프로토콜 전체 TVL (USD)",
                    dailyFees: "최근 24h 수수료 (USD)",
                    dailyRevenue: "최근 24h 수익 (USD)",
                  } as Record<string, string>
                )[key] ?? key}
                <b>{value?.toLocaleString("ko-KR") ?? "자료 없음"}</b>
              </span>
            ))}
          </div>
          {fundamentals.news.length > 0 && (
            <h4>공식 거버넌스 최신 게시글 제목 · 내용 검증 아님</h4>
          )}
          {fundamentals.news.map((n) => (
            <p key={n.url}>
              <a href={n.url} target="_blank" rel="noreferrer">
                {n.title}
              </a>{" "}
              · {n.publishedAt}
            </p>
          ))}
          {fundamentals.warnings.map((w) => (
            <p className="warning" key={w}>
              {w}
            </p>
          ))}
          {fundamentals.sources.map((s) => (
            <p className="subtle" key={s.id}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>{" "}
              · 자료 {s.publishedAt ?? "공개 시각 없음"} · 조회{" "}
              {new Date(s.retrievedAt).toLocaleString("ko-KR")}
            </p>
          ))}
        </div>
      )}
      <label>
        개인 AI 접근 토큰 (저장되지 않음)
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </label>
      {available === false && (
        <p className="warning">
          선택 기능 사용 불가: 서버 OpenAI 키·모델·개인 접근 토큰이 설정되지
          않았거나 상태를 확인할 수 없습니다. 스캐너·차트·모의 계획·기록은 계속
          사용할 수 있습니다.
        </p>
      )}
      <button
        disabled={busy || available !== true}
        onClick={() => void research(true)}
      >
        {busy ? "자료 확인 중…" : "AI 심층 분석"}
      </button>
      <p className="subtle">
        서버 OpenAI 키·모델·32자 이상 접근 토큰 필요 · 인스턴스당 시간당 3회 ·
        10분 캐시. AI는 검증된 실측 근거 ID와 제한된 가설만 선택하며 수치를
        생성하지 않습니다.
      </p>
      <p role="status">{message}</p>
      {report && (
        <article className="ai-report">
          <strong>AI 가설 · 점수와 독립</strong>
          <p>{researchLabels[report.report.thesis]}</p>
          {report.report.evidenceIds.map((id) => (
            <p key={id}>
              {signal.factors.find((f) => f.id === id)?.name ?? id}:{" "}
              {report.input.evidence.find((e) => e.id === id)?.actual}
            </p>
          ))}
          <p>반대 가설: {researchLabels[report.report.opposing]}</p>
          <p>무효화: {report.invalidation}</p>
          <p>불확실성: {researchLabels[report.report.uncertainty]}</p>
          {report.sources.length > 0 ? (
            <details>
              <summary>AI 입력 출처·시각</summary>
              {report.sources.map((s) => (
                <p key={s.id}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>{" "}
                  · 공개/갱신 {s.publishedAt ?? "미제공"} · 조회{" "}
                  {new Date(s.retrievedAt).toLocaleString("ko-KR")}
                </p>
              ))}
            </details>
          ) : (
            <p className="warning">
              검증된 외부 펀더멘털·뉴스 출처 없음 · 기술 지표만 사용
            </p>
          )}
          <p className="subtle">
            {report.model} ·{" "}
            {new Date(report.analyzedAt).toLocaleString("ko-KR")} · input SHA256{" "}
            {report.inputHash}
          </p>
          <button
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(report)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = `research-${report.id}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            분석 원본 JSON 보관
          </button>
        </article>
      )}
    </section>
  );
}
