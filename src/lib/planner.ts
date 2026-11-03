import { riskSchema, levelsSchema, type Risk, type Levels } from "./domain";
export function roundTick(
  value: number,
  tick: number,
  mode: "nearest" | "up" | "down" = "nearest",
) {
  const fn =
    mode === "up" ? Math.ceil : mode === "down" ? Math.floor : Math.round;
  return Number((fn(value / tick) * tick).toPrecision(12));
}
export function pnl(levels: Levels, risk: Risk) {
  if (
    !levelsSchema.safeParse(levels).success ||
    !riskSchema.safeParse(risk).success ||
    levels.stop <= levels.entry ||
    levels.tp1 >= levels.entry ||
    levels.tp2 > levels.tp1
  )
    return null;
  const notional = risk.margin * risk.leverage,
    qty = notional / levels.entry;
  const costs = (exit: number) =>
    (qty * (levels.entry + exit) * (risk.feeBps + risk.slippageBps)) / 10000;
  // 양수 펀딩은 숏 수취, 음수는 지급으로 계산한다.
  const funding = (notional * risk.fundingPct) / 100;
  const grossLoss = qty * (levels.stop - levels.entry),
    loss = grossLoss + costs(levels.stop) - funding;
  const gross = (exit: number) => qty * (levels.entry - exit);
  const tp1 = gross(levels.tp1) - costs(levels.tp1) + funding,
    tp2 = gross(levels.tp2) - costs(levels.tp2) + funding;
  const share = risk.tp1Pct / 100,
    reward = tp1 * share + tp2 * (1 - share);
  return {
    notional,
    qty,
    funding,
    loss,
    tp1,
    tp2,
    reward,
    netRR: loss > 0 ? reward / loss : 0,
    grossRR:
      grossLoss > 0
        ? (gross(levels.tp1) * share + gross(levels.tp2) * (1 - share)) /
          grossLoss
        : 0,
    marginReturn: (reward / risk.margin) * 100,
    accountRisk: risk.account > 0 ? (loss / risk.account) * 100 : null,
    movePct:
      ((levels.entry - (levels.tp1 * share + levels.tp2 * (1 - share))) /
        levels.entry) *
      100,
  };
}
