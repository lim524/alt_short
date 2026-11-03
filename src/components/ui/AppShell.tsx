"use client";
import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
export type Section =
  "overview" | "scan" | "watchlist" | "history" | "settings";
const navigation: { id: Section; label: string; icon: IconName }[] = [
  { id: "overview", label: "대시보드", icon: "home" },
  { id: "scan", label: "스캔", icon: "search" },
  { id: "watchlist", label: "관심 종목", icon: "bookmark" },
  { id: "history", label: "저장 시나리오", icon: "history" },
  { id: "settings", label: "설정", icon: "settings" },
];
export default function AppShell({
  section,
  onNavigate,
  running,
  children,
}: {
  section: Section;
  onNavigate: (s: Section) => void;
  running: boolean;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        본문으로 이동
      </a>
      <aside className="sidebar">
        <a href="/" className="brand">
          Short Scanner
          <span className="brand-dot" />
        </a>
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label="주 메뉴">
          {navigation.map((n) => (
            <button
              key={n.id}
              aria-current={section === n.id ? "page" : undefined}
              aria-label={n.label}
              className={section === n.id ? "nav-item active" : "nav-item"}
              onClick={() => onNavigate(n.id)}
            >
              <Icon name={n.icon} />
              <span>{n.id === "history" ? "분석 기록" : n.label}</span>
              {section === n.id && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="connection">
            <span className={running ? "status-dot on" : "status-dot"} />
            <span>{running ? "스캐너 실행 중" : "스캐너 대기 중"}</span>
          </div>
          <p>
            관찰하고, 비교하고,
            <br />
            나만의 시나리오를 만드세요.
          </p>
          <span className="paper-pill">
            <Icon name="shield" size={13} /> 모의 분석 전용
          </span>
        </div>
      </aside>
      <div className="mobile-header">
        <a className="brand" href="/">
          Short Scanner
          <span className="brand-dot" />
        </a>
        <span className="mobile-badge">RESEARCH</span>
      </div>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <nav className="mobile-nav" aria-label="모바일 주 메뉴">
        {navigation.map((n) => (
          <button
            key={n.id}
            aria-label={n.label}
            aria-current={section === n.id ? "page" : undefined}
            onClick={() => onNavigate(n.id)}
          >
            <Icon name={n.icon} size={21} />
            <span>
              {n.id === "overview"
                ? "홈"
                : n.id === "history"
                  ? "기록"
                  : n.label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
