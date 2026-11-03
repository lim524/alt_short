"use client";
import { useCallback, useEffect, useState } from "react";
import {
  exportBackup,
  importBackup,
  list,
  saveOutcome,
  type PlanEdit,
  type Outcome,
} from "../lib/storage";
import type { SignalSnapshot } from "../lib/domain";
export default function History({
  onOpen,
}: {
  onOpen: (s: SignalSnapshot, edit?: PlanEdit) => void;
}) {
  const [signals, setSignals] = useState<SignalSnapshot[]>([]),
    [edits, setEdits] = useState<PlanEdit[]>([]),
    [outcomes, setOutcomes] = useState<Outcome[]>([]),
    [observations, setObservations] = useState<SignalSnapshot[]>([]),
    [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    try {
      setSignals(
        (await list<SignalSnapshot>("signals")).sort(
          (a, b) => b.createdAt - a.createdAt,
        ),
      );
      setEdits(await list<PlanEdit>("edits"));
      setOutcomes(await list<Outcome>("outcomes"));
      setObservations(
        (await list<SignalSnapshot>("observations")).sort(
          (a, b) => b.retrievedAt - a.retrievedAt,
        ),
      );
    } catch {
      setMessage("이 브라우저에서 저장소에 접근할 수 없습니다.");
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function download() {
    try {
      const blob = new Blob([JSON.stringify(await exportBackup())], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `alt-short-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setMessage("내보내기 실패");
    }
  }
  return (
    <section className="panel history">
      <div className="panel-heading">
        <h2>저장된 시나리오 · {signals.length}</h2>
        <button onClick={download}>JSON 백업</button>
      </div>
      <p className="subtle">
        이 기기·브라우저 전용 IndexedDB입니다. PC와 iPhone은 동기화되지 않으며
        브라우저 데이터 삭제 시 사라집니다.
      </p>
      <label>
        백업 가져오기 (최대 20MB, 동일 ID 충돌 시 전체 취소)
        <input
          type="file"
          accept="application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              if (file.size > 20_000_000) throw Error("20MB 초과");
              await importBackup(await file.text());
              setMessage("가져오기 완료");
              await refresh();
            } catch {
              setMessage("백업 형식 오류, ID 충돌 또는 저장 공간 부족");
            }
            e.target.value = "";
          }}
        />
      </label>
      <p role="status">{message}</p>
      <details className="watch">
        <summary>자동 보관된 최근 측정 · {observations.length}건</summary>
        <p>
          최근 30건까지만 자동 보관합니다. 영구 보관할 계획은 열어서 시나리오로
          저장하세요.
        </p>
        {observations.map((s) => (
          <button key={s.id} onClick={() => onOpen(s)}>
            {s.symbol} · {s.strategy} · {s.score}점 ·{" "}
            {new Date(s.retrievedAt).toLocaleString("ko-KR")}
          </button>
        ))}
      </details>
      {signals.map((s) => {
        const versions = edits
          .filter((e) => e.signalId === s.id)
          .sort((a, b) => b.at - a.at);
        const events = outcomes
          .filter((e) => e.signalId === s.id)
          .sort((a, b) => b.at - a.at);
        return (
          <article className="history-card" key={s.id}>
            <strong>
              {s.symbol} · {s.strategy === "day" ? "데이트레이딩" : "스윙"} ·
              원본 {s.state} · {s.score}점
            </strong>
            <p>
              {new Date(s.createdAt).toLocaleString("ko-KR")} · 수정 버전{" "}
              {versions.length}
            </p>
            <div className="actions">
              <button onClick={() => onOpen(s)}>원본 분석</button>
              {versions.map((e, i) => (
                <button key={e.id} onClick={() => onOpen(s, e)}>
                  수정 계획 v{versions.length - i}
                </button>
              ))}
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                try {
                  await saveOutcome({
                    signalId: s.id,
                    status: form.get("status") as Outcome["status"],
                    note: String(form.get("note") ?? ""),
                    price: form.get("price") ? Number(form.get("price")) : null,
                  });
                  setMessage("후속 기록 저장 완료");
                  await refresh();
                } catch {
                  setMessage("후속 기록 저장 실패");
                }
              }}
            >
              <div className="form-grid">
                <label>
                  후속 상태
                  <select name="status">
                    <option value="paper-open">모의 진행</option>
                    <option value="paper-win">모의 수익</option>
                    <option value="paper-loss">모의 손실</option>
                    <option value="cancelled">취소</option>
                  </select>
                </label>
                <label>
                  관측 가격 (선택)
                  <input name="price" type="number" min="0" step="any" />
                </label>
                <label>
                  후속 메모
                  <input name="note" maxLength={2000} />
                </label>
              </div>
              <button type="submit">후속 결과 추가</button>
            </form>
            {events.map((e) => (
              <p className="subtle" key={e.id}>
                {new Date(e.at).toLocaleString("ko-KR")} · {e.status} ·{" "}
                {e.price ?? "가격 미입력"} · {e.note}
              </p>
            ))}
          </article>
        );
      })}
      {!signals.length && (
        <div className="empty">분석 상세에서 시나리오를 저장하세요.</div>
      )}
    </section>
  );
}
