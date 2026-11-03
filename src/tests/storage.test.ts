import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  saveScenario,
  saveOutcome,
  list,
  exportBackup,
  importBackup,
  saveObservation,
  type PlanEdit,
  type Outcome,
} from "../lib/storage";
import {
  defaultConfig,
  defaultRisk,
  type Bundle,
  type SignalSnapshot,
} from "../lib/domain";
import { analyze } from "../lib/scanner";
const bundle: Bundle = {
  market: {
    symbol: "AAVEUSDT",
    baseAsset: "AAVE",
    onboardDate: 1,
    tickSize: 0.01,
    price: 100,
    change: 0,
    quoteVolume: 1e7,
    spread: 0.01,
    bookTime: 1000,
    closeTime: 1000,
  },
  bars: {},
  benchmark: {},
  oi: null,
  funding: null,
  depth: null,
  retrievedAt: 1000,
  warnings: [],
};
describe("append-only decisions", () => {
  it("stores an independent raw observation with original risk assumptions", async () => {
    const signal = analyze(bundle, "day", defaultConfig, defaultRisk, 1000);
    await saveObservation(signal);
    signal.raw.market.price = 1;
    const stored = (await list<SignalSnapshot>("observations")).find(
      (s) => s.id === signal.id,
    )!;
    expect(stored.raw.market.price).toBe(100);
    expect(stored.riskAssumptions).toEqual(defaultRisk);
  });
  it("preserves original evidence across edits and outcomes; exports and imports idempotently", async () => {
    const signal = analyze(bundle, "day", defaultConfig, defaultRisk, 1000),
      levels = { entry: 100, stop: 110, tp1: 90, tp2: 80 };
    await saveScenario(signal, levels, defaultRisk);
    await saveScenario(
      { ...signal, score: 99 },
      { ...levels, entry: 99 },
      defaultRisk,
    );
    const stored = (await list<SignalSnapshot>("signals")).find(
      (s) => s.id === signal.id,
    )!;
    expect(stored.score).toBe(0);
    expect(
      (await list<PlanEdit>("edits")).filter((e) => e.signalId === signal.id),
    ).toHaveLength(2);
    await saveOutcome({
      signalId: signal.id,
      status: "paper-win",
      note: "후속 기록",
      price: 90,
    });
    expect(
      (await list<Outcome>("outcomes")).filter((o) => o.signalId === signal.id),
    ).toHaveLength(1);
    expect(
      (await list<SignalSnapshot>("signals")).find((s) => s.id === signal.id),
    ).toEqual(stored);
    const backup = await exportBackup();
    await importBackup(JSON.stringify(backup));
    expect(await exportBackup()).toEqual(backup);
  });
  it("rejects incompatible backups and conflicting immutable IDs", async () => {
    await expect(importBackup('{"version":2}')).rejects.toThrow();
    const backup = await exportBackup();
    backup.signals[0].score = 55;
    await expect(importBackup(JSON.stringify(backup))).rejects.toThrow();
    expect((await list<SignalSnapshot>("signals"))[0].score).toBe(0);
  });
  it("rejects orphaned outcomes", async () => {
    await expect(
      saveOutcome({
        signalId: "missing",
        status: "paper-loss",
        note: "",
        price: null,
      }),
    ).rejects.toThrow();
  });
});
