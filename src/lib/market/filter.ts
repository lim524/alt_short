import type { MarketSymbol } from "../../types/market";
export type Filters = {
  minVolume: number;
  maxSpread: number;
  minAge: number;
  includeBenchmarks: boolean;
  search: string;
};
export const defaults: Filters = {
  minVolume: 1_000_000,
  maxSpread: 0.15,
  minAge: 14,
  includeBenchmarks: false,
  search: "",
};
export function filterMarkets(
  markets: MarketSymbol[],
  filters: Filters,
  now: number,
) {
  const base = markets.filter(
    (m) =>
      (filters.includeBenchmarks ||
        !["BTCUSDT", "ETHUSDT"].includes(m.symbol)) &&
      m.symbol.includes(filters.search.toUpperCase()) &&
      m.onboardDate > 0 &&
      now - m.onboardDate >= filters.minAge * 86400000 &&
      now - m.closeTime < 120000 &&
      m.closeTime <= now + 30000 &&
      m.spread !== null &&
      m.spread <= filters.maxSpread &&
      m.bookTime !== null &&
      now - m.bookTime < 120000 &&
      m.bookTime <= now + 30000,
  );
  const sort = (a: MarketSymbol, b: MarketSymbol) =>
    b.quoteVolume - a.quoteVolume;
  return {
    standard: base.filter((m) => m.quoteVolume >= filters.minVolume).sort(sort),
    watch: base
      .filter(
        (m) => m.quoteVolume >= 500000 && m.quoteVolume < filters.minVolume,
      )
      .sort(sort),
  };
}
