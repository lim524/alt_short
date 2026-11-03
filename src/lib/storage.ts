import { z } from "zod";
import {
  signalSchema,
  levelsSchema,
  riskSchema,
  type SignalSnapshot,
  type Levels,
  type Risk,
} from "./domain";
const editSchema = z.object({
  id: z.string(),
  signalId: z.string(),
  at: z.number(),
  levels: levelsSchema,
  risk: riskSchema,
});
const outcomeSchema = z.object({
  id: z.string(),
  signalId: z.string(),
  at: z.number(),
  status: z.enum(["paper-open", "paper-win", "paper-loss", "cancelled"]),
  note: z.string().max(2000),
  price: z.number().positive().nullable(),
});
export type PlanEdit = z.infer<typeof editSchema>;
export type Outcome = z.infer<typeof outcomeSchema>;
const researchSchema = z.object({
  id: z.string(),
  signalId: z.string(),
  at: z.number(),
  data: z.record(z.string(), z.unknown()),
});
export type ResearchRecord = z.infer<typeof researchSchema>;
export const backupSchema = z
  .object({
    version: z.literal(1),
    signals: z.array(signalSchema).max(200),
    edits: z.array(editSchema).max(1000),
    outcomes: z.array(outcomeSchema).max(2000),
    observations: z.array(signalSchema).max(30).default([]),
    research: z.array(researchSchema).max(1000).default([]),
  })
  .refine(
    (b) =>
      [...b.edits, ...b.outcomes].every((e) =>
        b.signals.some((s) => s.id === e.signalId),
      ),
    "원본 신호 없는 후속 기록",
  );
type Store =
  | "signals"
  | "edits"
  | "outcomes"
  | "settings"
  | "watchlist"
  | "observations"
  | "research";
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("alt-short-v1", 2);
    req.onupgradeneeded = () => {
      for (const name of [
        "signals",
        "edits",
        "outcomes",
        "settings",
        "watchlist",
        "observations",
        "research",
      ])
        if (!req.result.objectStoreNames.contains(name))
          req.result.createObjectStore(name, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function transaction<T>(
  names: Store[],
  action: (tx: IDBTransaction) => T,
  mode: IDBTransactionMode = "readwrite",
): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode);
    let value: T;
    try {
      value = action(tx);
    } catch (e) {
      tx.abort();
      db.close();
      reject(e);
      return;
    }
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("저장 실패"));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("저장 취소"));
    };
  });
}
export async function list<T>(store: Store): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
export async function saveScenario(
  signal: SignalSnapshot,
  levels: Levels,
  risk: Risk,
) {
  const immutable = signalSchema.parse(structuredClone(signal));
  const edit = editSchema.parse({
    id: crypto.randomUUID(),
    signalId: signal.id,
    at: Date.now(),
    levels,
    risk,
  });
  await transaction(["signals", "edits"], (tx) => {
    const store = tx.objectStore("signals");
    const req = store.get(signal.id);
    req.onsuccess = () => {
      if (!req.result) store.add(immutable);
      tx.objectStore("edits").add(edit);
    };
  });
}
export async function saveOutcome(outcome: Omit<Outcome, "id" | "at">) {
  const value = outcomeSchema.parse({
    ...outcome,
    id: crypto.randomUUID(),
    at: Date.now(),
  });
  await transaction(["signals", "outcomes"], (tx) => {
    const r = tx.objectStore("signals").get(value.signalId);
    r.onsuccess = () => {
      if (!r.result) tx.abort();
      else tx.objectStore("outcomes").add(value);
    };
  });
}
export async function setPreference(id: string, value: unknown) {
  await transaction(["settings"], (tx) =>
    tx.objectStore("settings").put({ id, value }),
  );
}
export async function toggleWatch(symbol: string, enabled: boolean) {
  await transaction(["watchlist"], (tx) =>
    enabled
      ? tx.objectStore("watchlist").put({ id: symbol })
      : tx.objectStore("watchlist").delete(symbol),
  );
}
export async function saveObservation(signal: SignalSnapshot) {
  const value = signalSchema.parse(signal);
  await transaction(["observations"], (tx) => {
    const store = tx.objectStore("observations");
    const req = store.get(value.id);
    req.onsuccess = () => {
      if (!req.result) store.add(value);
      const all = store.getAll();
      all.onsuccess = () => {
        const values = (all.result as SignalSnapshot[]).sort(
          (a, b) => b.retrievedAt - a.retrievedAt,
        );
        for (const old of values.slice(30)) store.delete(old.id);
      };
    };
  });
}
export async function saveResearch(
  signal: SignalSnapshot,
  data: Record<string, unknown>,
) {
  const value = researchSchema.parse({
    id: crypto.randomUUID(),
    signalId: signal.id,
    at: Date.now(),
    data,
  });
  await transaction(["signals", "research"], (tx) => {
    const store = tx.objectStore("signals");
    const r = store.get(signal.id);
    r.onsuccess = () => {
      if (!r.result) store.add(signalSchema.parse(signal));
      tx.objectStore("research").add(value);
    };
  });
}
export async function exportBackup() {
  return {
    version: 1 as const,
    signals: await list<SignalSnapshot>("signals"),
    edits: await list<PlanEdit>("edits"),
    outcomes: await list<Outcome>("outcomes"),
    observations: await list<SignalSnapshot>("observations"),
    research: await list<ResearchRecord>("research"),
  };
}
export async function importBackup(text: string) {
  if (text.length > 20_000_000) throw Error("백업 최대 20MB");
  const data = backupSchema.parse(JSON.parse(text));
  await transaction(
    ["signals", "edits", "outcomes", "observations", "research"],
    (tx) => {
      for (const name of [
        "signals",
        "edits",
        "outcomes",
        "observations",
        "research",
      ] as const)
        for (const item of data[name]) {
          const store = tx.objectStore(name);
          const r = store.get(item.id);
          r.onsuccess = () => {
            if (!r.result) store.add(item);
            else if (JSON.stringify(r.result) !== JSON.stringify(item))
              tx.abort();
          };
        }
    },
  );
}
