"use client";

import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import type { TodayState } from "@/types/today";
import { dayTypeLabel } from "@/lib/readiness";
import HomeView from "@/components/views/HomeView";
import HealthView from "@/components/views/HealthView";
import CoachView from "@/components/views/CoachView";
import ProfileView from "@/components/views/ProfileView";
import TodayView from "@/components/views/TodayView";
import CheckInView from "@/components/views/CheckInView";
import TrendsView from "@/components/views/TrendsView";
import ReflectionView from "@/components/views/ReflectionView";
import WeeklyView from "@/components/views/WeeklyView";
import SettingsView from "@/components/views/SettingsView";
import WorkoutLogView from "@/components/views/WorkoutLogView";
import HistoryView from "@/components/views/HistoryView";

type ViewId =
  | "home"
  | "trends"
  | "health"
  | "coach"
  | "profile"
  | "checkin"
  | "reflect"
  | "week"
  | "workout"
  | "history"
  | "settings"
  | "legacy";

type TabId = "home" | "trends" | "health" | "coach" | "profile";

interface AppShellProps {
  userName: string;
  userInitial: string;
}

// Views that require the /api/today payload before they can render.
const NEEDS_DATA: ViewId[] = ["home", "trends", "health", "coach", "profile", "checkin", "reflect", "legacy"];

const VIEW_TITLE: Record<ViewId, string> = {
  home: "Today",
  trends: "Trends",
  health: "Health",
  coach: "Coach",
  profile: "Profile",
  checkin: "Morning Check-In",
  reflect: "Reflect",
  week: "This Week",
  workout: "Log Workout",
  history: "History",
  settings: "Settings",
  legacy: "Full Dashboard",
};

// Which primary tab is highlighted for each (possibly sub-) view.
const VIEW_TAB: Record<ViewId, TabId> = {
  home: "home",
  checkin: "home",
  legacy: "home",
  trends: "trends",
  week: "trends",
  history: "trends",
  health: "health",
  coach: "coach",
  reflect: "coach",
  profile: "profile",
  settings: "profile",
  workout: "profile",
};

// Views reachable from a bottom tab (rest are sub-screens with a back button).
const TAB_ROOTS: ViewId[] = ["home", "trends", "health", "coach", "profile"];

function DarkSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-3 text-[#9aa398]">
      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#b7ec4a] border-t-transparent" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}

export default function AppShell({ userName, userInitial }: AppShellProps) {
  const [view, setView] = useState<ViewId>("home");
  const [data, setData] = useState<TodayState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const dateKey = today.toLocaleDateString("en-CA");

  function fetchData(opts?: { soft?: boolean }) {
    const soft = opts?.soft === true;
    if (!soft) {
      setLoading(true);
      setError(null);
    }
    fetch(`/api/today?date=${dateKey}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API error ${res.status}`);
        return res.json() as Promise<TodayState>;
      })
      .then((json) => {
        setData(json);
        setLoading(false);
        // Background sync: pull again once Google has had time to land in DB.
        if (!soft && json.syncStatus?.updating) {
          window.setTimeout(() => fetchData({ soft: true }), 3500);
          window.setTimeout(() => fetchData({ soft: true }), 9000);
        }
      })
      .catch((e: Error) => {
        if (!soft) {
          setError(e.message);
          setLoading(false);
        }
      });
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onCheckInComplete() {
    fetchData();
    setView("home");
  }

  function go(next: ViewId) {
    setView(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  const activeTab = VIEW_TAB[view];
  const isRoot = TAB_ROOTS.includes(view);
  const needsData = NEEDS_DATA.includes(view);

  const dayLabel = data ? dayTypeLabel(data.readiness.dayType) : "";

  function renderContent() {
    if (needsData && loading) return <DarkSpinner />;
    if (needsData && error) {
      return (
        <div className="mt-6 rounded-2xl border border-[rgba(239,91,91,0.3)] bg-[rgba(239,91,91,0.08)] p-5 text-sm text-[#ef8b8b]">
          {error}
          <button className="ml-3 underline" onClick={() => fetchData()}>
            Retry
          </button>
        </div>
      );
    }

    switch (view) {
      case "home":
        return data ? (
          <HomeView
            data={data}
            onGoToCheckIn={() => go("checkin")}
            onOpenHealth={() => go("health")}
            onOpenCoach={() => go("coach")}
          />
        ) : null;

      case "trends":
        return data ? <TrendsView data={data} /> : null;

      case "health":
        return data ? <HealthView data={data} /> : null;

      case "coach":
        return data ? <CoachView data={data} onGoToCheckIn={() => go("checkin")} /> : null;

      case "profile":
        return data ? (
          <ProfileView
            data={data}
            userName={userName}
            userInitial={userInitial}
            onOpenSettings={() => go("settings")}
            onSignOut={() => signOut({ callbackUrl: "/" })}
          />
        ) : null;

      case "checkin":
        return data ? (
          <CheckInView
            date={dateKey}
            dateLabel={dateLabel}
            existing={data.checkIn}
            onComplete={onCheckInComplete}
          />
        ) : null;

      case "reflect":
        return data ? (
          <ReflectionView date={dateKey} dateLabel={dateLabel} dayTypeLabel={dayLabel} />
        ) : null;

      case "week":
        return <WeeklyView />;

      case "workout":
        return <WorkoutLogView />;

      case "history":
        return <HistoryView />;

      case "settings":
        return <SettingsView />;

      case "legacy":
        return data ? (
          <TodayView
            data={data}
            onGoToCheckIn={() => go("checkin")}
            onGoToTrends={() => go("trends")}
            onGoToReflect={() => go("reflect")}
          />
        ) : null;
    }
  }

  const menuItems: { id: ViewId; label: string }[] = [
    { id: "legacy", label: "Full dashboard (current)" },
    { id: "workout", label: "Log workout" },
    { id: "history", label: "History" },
    { id: "week", label: "This week" },
    { id: "reflect", label: "Evening reflection" },
    { id: "settings", label: "Settings" },
  ];

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    {
      id: "home",
      label: "Home",
      icon: (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
          <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      id: "trends",
      label: "Trends",
      icon: (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
          <path d="M4 16l5-5 4 3 6-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 7h4v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      id: "health",
      label: "Health",
      icon: (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
          <path d="M12 20S3.5 14.5 3.5 8.8A4.3 4.3 0 0 1 12 6a4.3 4.3 0 0 1 8.5 2.8C20.5 14.5 12 20 12 20Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M7 12h3l1.4-2.6L13.5 13l1.2-1.8H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      id: "coach",
      label: "Coach",
      icon: (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
          <path d="M12 3l1.8 5.4L19.5 10l-5.7 1.6L12 17l-1.8-5.4L4.5 10l5.7-1.6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor" />
        </svg>
      ),
    },
    {
      id: "profile",
      label: "Profile",
      icon: (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  return (
    <div className="app-dark min-h-screen lg:flex">
      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] px-3 py-5 lg:flex">
        <div className="flex items-center gap-2.5 px-3 pb-6">
          <div className="orb-sm h-8 w-8" />
          <span className="text-[17px] font-bold tracking-[-0.2px] text-[#f4f6f2]">FitAI</span>
        </div>

        <nav className="flex flex-col gap-1">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => go(tab.id)}
                className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[13.5px] font-medium transition ${active ? "bg-[rgba(183,236,74,0.1)] text-[#b7ec4a]" : "text-[#9aa398] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#f4f6f2]"}`}
              >
                <span className="[&_svg]:h-[18px] [&_svg]:w-[18px]">{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </nav>

        <p className="mb-1 mt-6 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6d766b]">
          More
        </p>
        <nav className="flex flex-col gap-0.5">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => go(item.id)}
              className={`flex items-center rounded-[12px] px-3 py-2 text-[13px] font-medium transition ${view === item.id ? "text-[#b7ec4a]" : "text-[#9aa398] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#f4f6f2]"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto border-t border-[rgba(255,255,255,0.06)] pt-3">
          <div className="flex items-center gap-3 px-2 pb-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#b7ec4a] to-[#8fd12a] text-[14px] font-bold text-[#0c1004]">
              {userInitial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[#f4f6f2]">{userName}</p>
              <p className="text-[11px] text-[#6d766b]">
                {data?.baseline.daysWithData ?? 0}/7 day baseline
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full items-center rounded-[12px] px-3 py-2 text-left text-[13px] font-medium text-[#ef5b5b] transition hover:bg-[rgba(239,91,91,0.08)]"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1">
        <div className="relative mx-auto w-full max-w-[440px] px-[18px] pb-[104px] lg:max-w-[1120px] lg:px-10 lg:pb-14">
          {/* Mobile top bar */}
          <header className="relative flex min-h-[48px] items-center justify-center pb-2 pt-3.5 lg:hidden">
            {!isRoot && (
              <button
                onClick={() => go(VIEW_TAB[view])}
                className="absolute left-[-8px] top-1/2 -translate-y-1/2 p-2 text-[#9aa398]"
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <div className="text-center">
              <h1 className="text-[17px] font-bold tracking-[-0.1px] text-[#f4f6f2]">
                {VIEW_TITLE[view]}
              </h1>
              {view === "home" && (
                <p className="text-[11.5px] text-[#6d766b]">
                  {dateLabel}
                  {dayLabel && <span className="text-[#b7ec4a]"> · {dayLabel}</span>}
                </p>
              )}
            </div>
            {view === "home" && (
              <button
                onClick={() => setMenuOpen(true)}
                className="absolute right-[-8px] top-1/2 -translate-y-1/2 p-2 text-[#9aa398]"
                aria-label="Menu"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="1.7" />
                  <circle cx="12" cy="12" r="1.7" />
                  <circle cx="19" cy="12" r="1.7" />
                </svg>
              </button>
            )}
          </header>

          {/* Desktop header */}
          <header className="hidden items-end justify-between pb-6 pt-8 lg:flex">
            <div>
              {!isRoot && (
                <button
                  onClick={() => go(VIEW_TAB[view])}
                  className="mb-2 flex items-center gap-1.5 text-[12.5px] font-medium text-[#9aa398] transition hover:text-[#f4f6f2]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Back
                </button>
              )}
              <p className="text-[12.5px] text-[#6d766b]">{dateLabel}</p>
              <h1 className="mt-0.5 text-[26px] font-bold tracking-[-0.4px] text-[#f4f6f2]">
                {VIEW_TITLE[view]}
              </h1>
            </div>
            {dayLabel && (
              <span className="flex items-center gap-2 rounded-full border border-[rgba(183,236,74,0.28)] bg-[rgba(183,236,74,0.07)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#b7ec4a]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#b7ec4a]" />
                {dayLabel}
              </span>
            )}
          </header>

          {/* Content */}
          <main>{renderContent()}</main>
        </div>
      </div>

      {/* Overflow menu — mobile only */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
          <div
            className="app-dark absolute bottom-0 left-1/2 w-full max-w-[440px] -translate-x-1/2 rounded-t-[22px] border-t border-[rgba(255,255,255,0.1)] bg-[#0b0d10] p-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[rgba(255,255,255,0.15)]" />
            <div className="flex items-center gap-3 px-2 pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#b7ec4a] to-[#8fd12a] text-[14px] font-bold text-[#0c1004]">
                {userInitial}
              </div>
              <div>
                <p className="text-[13.5px] font-semibold text-[#f4f6f2]">{userName}</p>
                <p className="text-[11px] text-[#6d766b]">
                  {data?.baseline.daysWithData ?? 0}/7 day baseline
                </p>
              </div>
            </div>
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                className="flex w-full items-center justify-between rounded-[12px] px-3 py-3 text-left text-[14px] text-[#f4f6f2] transition hover:bg-[rgba(255,255,255,0.05)]"
              >
                {item.label}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#6d766b]">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="mt-1 flex w-full items-center rounded-[12px] px-3 py-3 text-left text-[14px] text-[#ef5b5b] transition hover:bg-[rgba(239,91,91,0.08)]"
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      {/* Bottom tab bar — mobile only */}
      <nav className="fixed bottom-0 left-1/2 z-50 flex w-full max-w-[440px] -translate-x-1/2 items-center justify-around border-t border-[rgba(255,255,255,0.06)] bg-[rgba(7,9,7,0.9)] px-1.5 pt-3 pb-[calc(14px+env(safe-area-inset-bottom,0px))] backdrop-blur-xl lg:hidden">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => go(tab.id)}
              className={`flex flex-col items-center gap-1 px-2 py-0.5 transition-colors ${active ? "text-[#b7ec4a]" : "text-[#6d766b]"}`}
            >
              {tab.icon}
              <span className="text-[10px] font-semibold">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
