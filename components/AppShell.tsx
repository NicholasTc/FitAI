"use client";

import { useEffect, useState } from "react";
import type { TodayState } from "@/types/today";
import TodayView from "@/components/views/TodayView";
import CheckInView from "@/components/views/CheckInView";
import TrendsView from "@/components/views/TrendsView";

type ViewId = "today" | "checkin" | "trends";

const VIEW_LABELS: Record<ViewId, string> = {
  today: "Today",
  checkin: "Check-In",
  trends: "Trends",
};

function Spinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <svg
        className="h-6 w-6 animate-spin text-[#4a7df6]"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <span className="ml-3 text-sm text-[#63708f]">Syncing health data…</span>
    </div>
  );
}

interface AppShellProps {
  userName: string;
  userInitial: string;
}

export default function AppShell({ userName, userInitial }: AppShellProps) {
  const [view, setView] = useState<ViewId>("today");
  const [data, setData] = useState<TodayState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const dateKey = today.toLocaleDateString("en-CA");

  function fetchData() {
    setLoading(true);
    setError(null);
    fetch(`/api/today?date=${dateKey}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API error ${res.status}`);
        return res.json() as Promise<TodayState>;
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After check-in submission, re-fetch so readiness updates
  function onCheckInComplete() {
    fetchData();
    setView("today");
  }

  const dayType = data?.readiness.dayType;
  const dayTypeChipStyle =
    dayType === "push"
      ? "bg-[#fff3f0] text-[#e05f3c] border border-[rgba(224,95,60,0.22)]"
      : dayType === "maintain"
        ? "bg-[#ecfaf6] text-[#009e83] border border-[rgba(0,158,131,0.22)]"
        : dayType === "recover"
          ? "bg-[#f4f0ff] text-[#7850e2] border border-[rgba(120,80,226,0.22)]"
          : "bg-[#f4f5fb] text-[#63708f]";
  const dayTypeLabel =
    dayType === "push"
      ? "Push Day"
      : dayType === "maintain"
        ? "Maintain Day"
        : dayType === "recover"
          ? "Recover Day"
          : "Syncing…";

  // Nav items
  const navItems: { id: ViewId; icon: string; label: string }[] = [
    { id: "today", icon: "◎", label: "Today" },
    { id: "checkin", icon: "✎", label: "Check-In" },
    { id: "trends", icon: "↗", label: "Trends" },
  ];

  function NavContent() {
    return (
      <>
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#4a7df6] to-[#7850e2] shadow-[0_4px_12px_rgba(74,125,246,0.35)]">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <path
                d="M9 2L11.5 7H16L12.5 10.5L14 15.5L9 12.5L4 15.5L5.5 10.5L2 7H6.5L9 2Z"
                fill="white"
                opacity="0.9"
              />
            </svg>
          </div>
          <span className="font-[family-name:var(--font-display)] text-[17px] font-bold tracking-tight text-[#1b2040]">
            FitAI
          </span>
        </div>

        {/* Nav groups */}
        <div className="flex-1 px-3 pb-4">
          <p className="mb-1 px-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#9ea8c4]">
            Main
          </p>
          <nav className="flex flex-col gap-0.5">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setView(item.id);
                  setMobileNavOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-[13.5px] font-medium transition-all ${
                  view === item.id
                    ? "bg-[#eef3ff] text-[#4a7df6] shadow-[0_1px_6px_rgba(74,125,246,0.12)]"
                    : "text-[#63708f] hover:bg-[rgba(0,0,0,0.04)] hover:text-[#1b2040]"
                }`}
              >
                <span className="w-4 text-center text-[15px]">{item.icon}</span>
                {item.label}
                {item.id === "checkin" && !data?.checkIn && (
                  <span className="ml-auto h-2 w-2 rounded-full bg-[#4a7df6]" />
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* User */}
        <div className="border-t border-[rgba(148,162,218,0.14)] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#4a7df6] to-[#7850e2] text-[13px] font-bold text-white">
              {userInitial}
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#1b2040]">{userName}</p>
              <p className="text-[11px] text-[#9ea8c4]">
                {data?.baseline.daysWithData ?? 0}/7 day baseline
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — desktop */}
      <aside className="hidden w-[220px] flex-shrink-0 flex-col border-r border-[rgba(148,162,218,0.14)] bg-[rgba(255,255,255,0.85)] backdrop-blur-xl lg:flex">
        <NavContent />
      </aside>

      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-[rgba(27,32,64,0.3)] backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[rgba(148,162,218,0.14)] bg-white transition-transform duration-300 lg:hidden ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <NavContent />
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-[60px] items-center gap-4 border-b border-[rgba(148,162,218,0.14)] bg-[rgba(238,240,249,0.92)] px-4 backdrop-blur-xl sm:px-6">
          {/* Mobile hamburger */}
          <button
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#63708f] hover:bg-[rgba(0,0,0,0.06)] lg:hidden"
            onClick={() => setMobileNavOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect y="3" width="18" height="1.8" rx="1" fill="currentColor" />
              <rect y="8.1" width="18" height="1.8" rx="1" fill="currentColor" />
              <rect y="13.2" width="18" height="1.8" rx="1" fill="currentColor" />
            </svg>
          </button>

          <div className="flex-1">
            <p className="text-[11.5px] text-[#9ea8c4]">{dateLabel}</p>
            <p className="font-[family-name:var(--font-display)] text-[15px] font-bold leading-tight text-[#1b2040]">
              {VIEW_LABELS[view]}
            </p>
          </div>

          {data && (
            <div
              className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold sm:flex ${dayTypeChipStyle}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
              {dayTypeLabel}
            </div>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {loading && <Spinner />}
          {error && !loading && (
            <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-600">
              {error}
              <button
                className="ml-3 underline"
                onClick={fetchData}
              >
                Retry
              </button>
            </div>
          )}
          {!loading && !error && data && (
            <>
              {view === "today" && (
                <TodayView
                  data={data}
                  onGoToCheckIn={() => setView("checkin")}
                  onGoToTrends={() => setView("trends")}
                />
              )}
              {view === "checkin" && (
                <CheckInView
                  date={dateKey}
                  dateLabel={dateLabel}
                  existing={data.checkIn}
                  onComplete={onCheckInComplete}
                />
              )}
              {view === "trends" && <TrendsView data={data} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
