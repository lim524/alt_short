"use client";
import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  type UTCTimestamp,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import type { Candle } from "../types/market";
import type { Levels } from "../lib/domain";
import { ema, atr } from "../lib/market/indicators";
import { roundTick } from "../lib/planner";
type Key = keyof Levels;
const colors: Record<Key, string> = {
  entry: "#c18a16",
  stop: "#e24c59",
  tp1: "#1e9974",
  tp2: "#527ba4",
};
export default function MarketChart({
  candles,
  symbol,
  levels = null,
  tick = 0.01,
  onLevels,
  focusTime,
}: {
  candles: Candle[];
  symbol: string;
  levels?: Levels | null;
  tick?: number;
  onLevels?: (l: Levels) => void;
  focusTime?: number;
}) {
  const container = useRef<HTMLDivElement>(null),
    chartRef = useRef<IChartApi | null>(null),
    seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [locked, setLocked] = useState(true),
    [showEma, setShowEma] = useState(true),
    [showStructure, setShowStructure] = useState(false),
    [showATR, setShowATR] = useState(false),
    [full, setFull] = useState(false);
  const [positions, setPositions] = useState<Partial<Record<Key, number>>>({});
  const drag = useRef<{ key: Key; clientY: number; coordinate: number } | null>(
    null,
  );
  const latest = useRef({ levels, onLevels });
  latest.current = { levels, onLevels };
  useEffect(() => {
    if (!container.current || !candles.length) return;
    const chart = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#8a8d98",
        attributionLogo: true,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "#f0f1f4" },
      },
      timeScale: { timeVisible: true },
      rightPriceScale: { borderVisible: false },
      crosshair: {
        vertLine: { color: "#b9bdc7", labelBackgroundColor: "#24252a" },
        horzLine: { color: "#b9bdc7", labelBackgroundColor: "#24252a" },
      },
    });
    chartRef.current = chart;
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#629aeb",
      downColor: "#ee6170",
      borderVisible: false,
      wickUpColor: "#629aeb",
      wickDownColor: "#ee6170",
      priceFormat: {
        type: "price",
        minMove: tick,
        precision: Math.max(
          0,
          Math.min(
            10,
            (tick.toFixed(10).replace(/0+$/, "").split(".")[1] ?? "").length,
          ),
        ),
      },
    });
    seriesRef.current = series;
    series.setData(
      candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })),
    );
    series
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.1, bottom: 0.25 } });
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    volume
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    volume.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "#629aeb33" : "#ee617033",
      })),
    );
    if (showEma)
      for (const period of [20, 50]) {
        const values = ema(
          candles.map((c) => c.close),
          period,
        );
        chart
          .addSeries(LineSeries, {
            color: period === 20 ? "#d7a54b" : "#a7a2d7",
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
          })
          .setData(
            values.map((value, i) => ({
              time: candles[i + period - 1].time as UTCTimestamp,
              value,
            })),
          );
      }
    if (showStructure)
      for (const [price, title] of [
        [Math.min(...candles.slice(-50).map((c) => c.low)), "50봉 지지"],
        [Math.max(...candles.slice(-50).map((c) => c.high)), "50봉 저항"],
      ] as const)
        series.createPriceLine({
          price,
          title,
          color: "#9ca3b2",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
        });
    chart.timeScale().fitContent();
    const timer = window.setInterval(() => {
      const l = latest.current.levels;
      if (!l) return;
      const p: Partial<Record<Key, number>> = {};
      for (const k of Object.keys(l) as Key[]) {
        const y = series.priceToCoordinate(l[k]);
        if (y !== null) p[k] = y;
      }
      setPositions((old) =>
        JSON.stringify(old) === JSON.stringify(p) ? old : p,
      );
    }, 100);
    return () => {
      clearInterval(timer);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [candles, tick, showEma, showStructure]);
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !levels) return;
    const lines = (Object.keys(levels) as Key[])
      .filter((k) => Number.isFinite(levels[k]) && levels[k] > 0)
      .map((k) =>
        series.createPriceLine({
          price: levels[k],
          color: colors[k],
          lineWidth: 2,
          lineStyle: 0,
          title: k.toUpperCase(),
          axisLabelVisible: true,
        }),
      );
    return () => {
      if (seriesRef.current === series)
        for (const line of lines) series.removePriceLine(line);
    };
  }, [levels, candles, showEma, showStructure, tick]);
  useEffect(() => {
    chartRef.current?.applyOptions({
      handleScroll: locked,
      handleScale: locked,
    });
  }, [locked, candles, showEma, showStructure]);
  useEffect(() => {
    if (!focusTime || !chartRef.current) return;
    const middle = focusTime / 1000;
    const span = candles[1]?.time - candles[0]?.time || 3600;
    chartRef.current.timeScale().setVisibleRange({
      from: (middle - span * 15) as UTCTimestamp,
      to: (middle + span * 5) as UTCTimestamp,
    });
  }, [focusTime, candles]);
  function move(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag.current || !latest.current.levels || !container.current) return;
    const y = drag.current.coordinate + e.clientY - drag.current.clientY;
    const price = seriesRef.current?.coordinateToPrice(y);
    if (price && price > 0)
      latest.current.onLevels?.({
        ...latest.current.levels,
        [drag.current.key]: roundTick(price, tick),
      });
  }
  const yEntry = positions.entry,
    yStop = positions.stop,
    yTp = positions.tp2;
  const handlePositions: Partial<Record<Key, number>> = {};
  let previousY = -44;
  for (const key of (Object.keys(positions) as Key[]).sort(
    (a, b) => positions[a]! - positions[b]!,
  )) {
    const y = Math.max(previousY + 46, positions[key]! - 22, 0);
    handlePositions[key] = y;
    previousY = y;
  }
  return (
    <div className={full ? "chart-module chart-full" : "chart-module"}>
      <div className="chart-tools">
        <label>
          <input
            type="checkbox"
            checked={showEma}
            onChange={(e) => setShowEma(e.target.checked)}
          />{" "}
          EMA20/50
        </label>
        <label>
          <input
            type="checkbox"
            checked={showStructure}
            onChange={(e) => setShowStructure(e.target.checked)}
          />{" "}
          지지/저항
        </label>
        <label>
          <input
            type="checkbox"
            checked={showATR}
            onChange={(e) => setShowATR(e.target.checked)}
          />{" "}
          ATR
        </label>
        <button onClick={() => setFull((v) => !v)}>
          {full ? "차트 축소" : "차트 크게"}
        </button>
        {levels && (
          <button aria-pressed={!locked} onClick={() => setLocked((v) => !v)}>
            {locked ? "🔒 선 편집 잠김" : "선 편집 활성"}
          </button>
        )}
      </div>
      {showATR && (
        <p className="subtle">
          ATR14: {atr(candles)?.toPrecision(6) ?? "자료 부족"}
        </p>
      )}
      <div className="chart-surface">
        <div
          ref={container}
          className="chart"
          role="img"
          aria-label={`${symbol} 캔들·거래량·모의 계획 차트`}
        />
        {levels && (
          <div className="chart-overlay">
            {yEntry !== undefined && yStop !== undefined && (
              <div
                className="risk-zone"
                style={{
                  top: Math.min(yEntry, yStop),
                  height: Math.abs(yEntry - yStop),
                  background: "#ee617013",
                }}
              />
            )}
            {yEntry !== undefined && yTp !== undefined && (
              <div
                className="risk-zone"
                style={{
                  top: Math.min(yEntry, yTp),
                  height: Math.abs(yTp - yEntry),
                  background: "#359e7b0b",
                }}
              />
            )}
            {!locked &&
              (Object.keys(levels) as Key[]).map(
                (k) =>
                  positions[k] !== undefined && (
                    <button
                      aria-label={`${k} 차트 선 이동`}
                      className="line-handle"
                      key={k}
                      style={{
                        top: handlePositions[k],
                        borderColor: colors[k],
                        color: colors[k],
                      }}
                      onPointerDown={(e) => {
                        drag.current = {
                          key: k,
                          clientY: e.clientY,
                          coordinate: positions[k]!,
                        };
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={move}
                      onPointerUp={(e) => {
                        drag.current = null;
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      }}
                      onPointerCancel={() => {
                        drag.current = null;
                      }}
                    >
                      {k.toUpperCase()} ↕
                    </button>
                  ),
              )}
          </div>
        )}
      </div>
      <p className="subtle">
        {locked
          ? "확대·이동 가능 · 선 편집 활성 후 손잡이를 드래그하세요."
          : "편집 중 차트 이동·확대 잠금 · 숫자 입력도 가능합니다."}
      </p>
    </div>
  );
}
