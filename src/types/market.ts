export const intervals = ["5m", "15m", "1h", "4h", "1d"] as const;
export type Interval = (typeof intervals)[number];
export type MarketSymbol = {
  symbol: string;
  baseAsset: string;
  onboardDate: number;
  tickSize: number;
  price: number;
  change: number;
  quoteVolume: number;
  closeTime: number;
  spread: number | null;
  bookTime: number | null;
};
export type Candle = {
  time: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuyVolume?: number;
};
export type MarketSnapshot = {
  markets: MarketSymbol[];
  retrievedAt: number;
  expiresAt: number;
  warnings: string[];
  source: string;
};
export type CandleSnapshot = {
  candles: Candle[];
  symbol: string;
  interval: Interval;
  retrievedAt: number;
  expiresAt: number;
  serverTime: number;
  source: string;
};
