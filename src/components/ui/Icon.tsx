import type { CSSProperties } from "react";
const paths = {
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  search: "m21 21-4.4-4.4M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0",
  bookmark: "M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4Z",
  history: "M4 20V12h3v8Zm6 0V4h3v16Zm6 0V8h3v12Z",
  settings:
    "m9.5 3-.7 2.2-2 .9-2.1-.5-2 3.4 1.5 1.7v2.6L2.7 15l2 3.4 2.1-.5 2 .9.7 2.2h4l.7-2.2 2-.9 2.1.5 2-3.4-1.5-1.7v-2.6l1.5-1.7-2-3.4-2.1.5-2-.9L13.5 3Zm6 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  play: "m8 4 13 8-13 8Z",
  stop: "M6 6h12v12H6Z",
  chevron: "m9 5 7 7-7 7",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  star: "m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z",
  sliders: "M4 7h5m5 0h6M4 17h10m5 0h1M9 4v6m5 4v6",
  sparkle: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  shield: "m12 3 8 3v5c0 5-8 10-8 10S4 16 4 11V6Z",
  refresh:
    "M20 7v5h-5M4 17v-5h5M5.7 7a7 7 0 0 1 11.6-1L20 12M4 12l2.7 6a7 7 0 0 0 11.6-1",
} as const;
export type IconName = keyof typeof paths;
export default function Icon({
  name,
  size = 20,
  className = "",
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
