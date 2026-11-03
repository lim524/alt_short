import { z } from "zod";
export const reportSchema = z.object({
  thesis: z.enum([
    "trend-continuation",
    "failed-rebound",
    "relative-weakness",
    "insufficient-evidence",
  ]),
  evidenceIds: z.array(z.string()).max(5),
  opposing: z.enum(["short-squeeze", "trend-reversal", "btc-rally"]),
  uncertainty: z.enum(["missing-data", "unvalidated-rules", "source-coverage"]),
});
export const researchLabels = {
  "trend-continuation": "하락 추세가 이어질 가능성을 검토하는 가설입니다.",
  "failed-rebound": "반등 실패가 약세를 뒷받침할 수 있다는 가설입니다.",
  "relative-weakness": "시장 대비 약세가 지속될 가능성을 검토하는 가설입니다.",
  "insufficient-evidence":
    "현재 자료만으로 일관된 숏 근거를 구성하기 어렵습니다.",
  "short-squeeze":
    "매도 포지션 집중 이후 급격한 숏 스퀴즈가 발생할 수 있습니다.",
  "trend-reversal": "지지 구간에서 매수가 유입되어 추세가 반전될 수 있습니다.",
  "btc-rally": "BTC 상승이 알트 반등으로 이어져 숏 가설이 약화될 수 있습니다.",
  "missing-data": "누락·지연 자료로 판단이 제한됩니다.",
  "unvalidated-rules":
    "점수 가설은 아직 외표본 성과 검증을 통과하지 않았습니다.",
  "source-coverage": "펀더멘털·뉴스 출처 범위가 제한되어 있습니다.",
};
export function validateReport(raw: unknown, known: string[]) {
  const report = reportSchema.parse(raw);
  if (
    report.evidenceIds.some((id) => !known.includes(id)) ||
    new Set(report.evidenceIds).size !== report.evidenceIds.length
  )
    throw Error("미검증 근거 ID");
  return report;
}
