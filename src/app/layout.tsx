import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Alt Short · Market Scanner",
  description: "Binance USDT 무기한 선물 시장 탐색기",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
