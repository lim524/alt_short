import { z } from "zod";
import {
  intervals,
  type CandleSnapshot,
  type Interval,
  type MarketSymbol,
} from "../types/market";
export const configSchema = z
  .object({
    version: z.literal("1.0"),
    dayWeights: z.array(z.number().min(0).max(100)).length(5),
    swingWeights: z.array(z.number().min(0).max(100)).length(5),
    watchScore: z.number().min(0).max(100),
    sellRatio: z.number().min(1).max(5),
    dayWeakness: z.number().min(0).max(20),
    swingWeakness: z.number().min(0).max(50),
    dayRR: z.number().min(1).max(10),
    swingRR: z.number().min(1).max(10),
    atrBuffer: z.number().min(0.1).max(5),
    candidateLimit: z.number().int().min(1).max(20),
  })
  .refine(
    (c) =>
      [c.dayWeights, c.swingWeights].every(
        (w) => Math.abs(w.reduce((a, b) => a + b, 0) - 100) < 0.001,
      ),
    "가중치 합계는 각각 100이어야 합니다.",
  );
export type ScannerConfig = z.infer<typeof configSchema>;
export const defaultConfig: ScannerConfig = {
  version: "1.0",
  dayWeights: [25, 25, 20, 15, 15],
  swingWeights: [30, 25, 20, 15, 10],
  watchScore: 70,
  sellRatio: 1.2,
  dayWeakness: 2,
  swingWeakness: 5,
  dayRR: 1.5,
  swingRR: 2,
  atrBuffer: 0.5,
  candidateLimit: 10,
};
export const levelsSchema = z.object({
  entry: z.number().positive(),
  stop: z.number().positive(),
  tp1: z.number().positive(),
  tp2: z.number().positive(),
});
export type Levels = z.infer<typeof levelsSchema>;
export const riskSchema = z.object({
  margin: z.number().positive().max(1e9),
  leverage: z.number().min(1).max(20),
  feeBps: z.number().min(0).max(100),
  slippageBps: z.number().min(0).max(500),
  fundingPct: z.number().min(-10).max(10),
  tp1Pct: z.number().min(0).max(100),
  account: z.number().min(0).max(1e12),
});
export type Risk = z.infer<typeof riskSchema>;
export const defaultRisk: Risk = {
  margin: 100,
  leverage: 2,
  feeBps: 5,
  slippageBps: 5,
  fundingPct: 0,
  tp1Pct: 50,
  account: 1000,
};
export const evidenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  weight: z.number(),
  points: z.number(),
  status: z.enum(["pass", "fail", "unknown"]),
  actual: z.string(),
  threshold: z.string(),
  explanation: z.string(),
  at: z.number().nullable(),
  source: z.string(),
});
export type MetricEvidence = z.infer<typeof evidenceSchema>;
export const stateSchema = z.enum([
  "WATCH",
  "SETUP",
  "TRIGGERED",
  "INVALIDATED",
  "EXPIRED",
]);
export type SignalState = z.infer<typeof stateSchema>;
export type Strategy = "day" | "swing";
export type Bundle = {
  market: MarketSymbol;
  bars: Partial<Record<Interval, CandleSnapshot>>;
  benchmark: Partial<Record<Interval, CandleSnapshot>>;
  oi: { value: number; time: number }[] | null;
  funding: { rate: number; time: number; nextTime: number } | null;
  depth: {
    bids: [number, number][];
    asks: [number, number][];
    time: number;
  } | null;
  retrievedAt: number;
  warnings: string[];
};
const candleSchema = z.object({
  time: z.number().nonnegative(),
  closeTime: z.number().nonnegative(),
  open: z.number().positive(),
  high: z.number().positive(),
  low: z.number().positive(),
  close: z.number().positive(),
  volume: z.number().nonnegative(),
  takerBuyVolume: z.number().nonnegative().optional(),
});
const barSchema = z.object({
  symbol: z.string(),
  interval: z.enum(intervals),
  retrievedAt: z.number(),
  expiresAt: z.number(),
  serverTime: z.number(),
  source: z.string(),
  candles: z.array(candleSchema).max(300),
});
const marketSchema = z.object({
  symbol: z.string(),
  baseAsset: z.string(),
  onboardDate: z.number(),
  tickSize: z.number().positive(),
  price: z.number().positive(),
  change: z.number(),
  quoteVolume: z.number().nonnegative(),
  closeTime: z.number(),
  spread: z.number().nonnegative().nullable(),
  bookTime: z.number().nullable(),
});
const bookLevel = z.tuple([z.number().positive(), z.number().nonnegative()]);
export const bundleSchema = z.object({
  market: marketSchema,
  bars: z.partialRecord(z.enum(intervals), barSchema),
  benchmark: z.partialRecord(z.enum(intervals), barSchema),
  oi: z
    .array(z.object({ value: z.number().positive(), time: z.number() }))
    .max(500)
    .nullable(),
  funding: z
    .object({ rate: z.number(), time: z.number(), nextTime: z.number() })
    .nullable(),
  depth: z
    .object({
      bids: z.array(bookLevel).max(100),
      asks: z.array(bookLevel).max(100),
      time: z.number(),
    })
    .nullable(),
  retrievedAt: z.number(),
  warnings: z.array(z.string()),
});
export const signalSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  strategy: z.enum(["day", "swing"]),
  state: stateSchema,
  createdAt: z.number(),
  expiresAt: z.number(),
  barCloseTime: z.number(),
  retrievedAt: z.number(),
  config: configSchema,
  riskAssumptions: riskSchema,
  codeVersion: z.literal("scanner-1.0"),
  score: z.number().min(0).max(100),
  coverage: z.number().min(0).max(100),
  factors: z.array(evidenceSchema).max(5),
  supporting: z.array(z.string()),
  opposing: z.array(z.string()),
  trigger: z.string(),
  invalidation: z.string(),
  blockers: z.array(z.string()),
  proposed: levelsSchema.nullable(),
  levelReason: z.string(),
  transitions: z.array(
    z.object({ state: stateSchema, at: z.number(), reason: z.string() }),
  ),
  raw: bundleSchema,
});
export type SignalSnapshot = z.infer<typeof signalSchema>;
