"use client";

import { computeBMR } from "@/lib/bmr";
import type { TodayState } from "@/types/today";

interface ProfileViewProps {
  data: TodayState;
  userName: string;
  userInitial: string;
  onOpenSettings: () => void;
  onSignOut: () => void;
}

// ─── Icons ─────────────────────────────────────────────────────────────────

function Chevron() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[#6d766b]">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS = {
  baseline: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  method: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  confidence: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="0.7" fill="currentColor" />
    </svg>
  ),
  watch: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="7" y="6" width="10" height="12" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 6l.5-3h5l.5 3M9 18l.5 3h5l.5-3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  link: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M9 15l6-6M10.5 6.5l1-1a4 4 0 0 1 6 6l-1 1M13.5 17.5l-1 1a4 4 0 0 1-6-6l1-1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  clock: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v4l2.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  labels: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  person: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.5 20c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  appearance: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  signout: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M15 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9M15 12H10M15 12l-2.5-2.5M15 12l-2.5 2.5M20 12h-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

// ─── Row primitives ────────────────────────────────────────────────────────

function ListCard({ children }: { children: React.ReactNode }) {
  return <div className="gcard px-4">{children}</div>;
}

function InfoRow({
  icon,
  title,
  sub,
  value,
  tint = "text-[#b7ec4a]",
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  value: string;
  tint?: string;
}) {
  return (
    <div className="flex items-center gap-3.5 border-t border-[rgba(255,255,255,0.06)] py-3.5 first:border-t-0">
      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[rgba(255,255,255,0.05)] text-[#9aa398]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-[600] text-[#f4f6f2]">{title}</span>
        {sub && <span className="mt-0.5 block text-[11.5px] text-[#6d766b]">{sub}</span>}
      </span>
      <span className={`shrink-0 text-[13px] font-[600] ${tint}`}>{value}</span>
    </div>
  );
}

function ActionRow({
  icon,
  title,
  sub,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3.5 border-t border-[rgba(255,255,255,0.06)] py-3.5 text-left transition first:border-t-0 hover:opacity-80"
    >
      <span
        className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[rgba(255,255,255,0.05)] ${danger ? "text-[#ef5b5b]" : "text-[#9aa398]"}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[14px] font-[600] ${danger ? "text-[#ef5b5b]" : "text-[#f4f6f2]"}`}>
          {title}
        </span>
        {sub && <span className="mt-0.5 block text-[11.5px] text-[#6d766b]">{sub}</span>}
      </span>
      {!danger && <Chevron />}
    </button>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function ProfileView({
  data,
  userName,
  userInitial,
  onOpenSettings,
  onSignOut,
}: ProfileViewProps) {
  const { readiness, baseline, settings, syncStatus } = data;

  const synced = !syncStatus || syncStatus.ok;
  const scopesGranted = synced || syncStatus?.code !== "missing_scopes";

  const zScoring =
    readiness.breakdown.hrv.method === "z-score" || readiness.breakdown.restingHr.method === "z-score";

  const confidenceLabel =
    readiness.confidence.charAt(0).toUpperCase() + readiness.confidence.slice(1);

  const bmr = computeBMR({
    age: settings.age,
    sex: settings.sex,
    heightCm: settings.heightCm,
    weightKg: settings.weightKg,
  });

  const bioParts = [
    settings.age !== null ? `${settings.age}y` : null,
    settings.heightCm !== null ? `${settings.heightCm} cm` : null,
    settings.weightKg !== null ? `${settings.weightKg} kg` : null,
  ].filter(Boolean);
  const bioSub =
    bioParts.length > 0
      ? `${bioParts.join(" · ")}${bmr !== null ? ` → BMR ${Math.round(bmr).toLocaleString()} kcal` : ""}`
      : "Add age, height & weight to enable BMR";

  const baselineWord = baseline.status === "ready" ? "Ready" : "Forming";

  const to12h = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
  };

  return (
    <div className="screen-in mx-auto max-w-[720px] pb-6">
      {/* Header */}
      <div className="gcard mt-2 flex items-center gap-4 p-[18px_17px]">
        <div
          className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full text-[26px] font-bold text-[#0c1004]"
          style={{
            background: "radial-gradient(circle at 36% 32%, #e5ff9e, #b7ec4a 58%, #7cbb22)",
            boxShadow:
              "0 0 0 2px #05070a, 0 0 0 3.5px rgba(196,245,110,0.55), 0 8px 26px -6px rgba(183,236,74,0.5)",
          }}
        >
          {userInitial}
        </div>
        <div className="min-w-0">
          <div className="text-[19px] font-bold text-[#f4f6f2]">{userName}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[13px] font-semibold text-[#b7ec4a]">
            FitAI Beta
            <span className="rounded-full border border-[rgba(183,236,74,0.4)] px-2 py-[1px] text-[10px] font-bold">
              Founder
            </span>
          </div>
          <div className="mt-1.5 text-[12px] text-[#6d766b]">
            Baseline {baselineWord} · {baseline.daysWithData} days
            {zScoring ? " · z-scoring active" : ""}
          </div>
        </div>
      </div>

      {/* Scoring */}
      <div className="section-label">Scoring</div>
      <ListCard>
        <InfoRow
          icon={ICONS.baseline}
          title="Baseline"
          sub="Rolling window with per-metric SD"
          value={`${baselineWord} · ${baseline.daysWithData}d`}
          tint={baseline.status === "ready" ? "text-[#b7ec4a]" : "text-[#e8b45a]"}
        />
        <InfoRow
          icon={ICONS.method}
          title="Scoring method"
          sub={zScoring ? "Personal z-scores + training load" : "Ratio vs your average"}
          value={zScoring ? "Z-score + load" : "Ratio-based"}
        />
        <InfoRow
          icon={ICONS.confidence}
          title="Confidence today"
          sub={`${Math.round(readiness.dataCompleteness * 100)}% of key signals are real data`}
          value={confidenceLabel}
          tint={
            readiness.confidence === "high"
              ? "text-[#b7ec4a]"
              : readiness.confidence === "medium"
                ? "text-[#e8b45a]"
                : "text-[#ef5b5b]"
          }
        />
      </ListCard>

      {/* Connected */}
      <div className="section-label">Connected</div>
      <ListCard>
        <InfoRow
          icon={ICONS.watch}
          title="Fitbit"
          sub="via Google Health API"
          value={synced ? "Synced" : "Not syncing"}
          tint={synced ? "text-[#b7ec4a]" : "text-[#ef5b5b]"}
        />
        <InfoRow
          icon={ICONS.link}
          title="Google account"
          sub={scopesGranted ? "Health scopes granted" : "Health scopes missing"}
          value={scopesGranted ? "Connected" : "Reauthorize"}
          tint={scopesGranted ? "text-[#b7ec4a]" : "text-[#e8b45a]"}
        />
      </ListCard>
      {syncStatus && !syncStatus.ok && syncStatus.message && (
        <p className="mt-2 px-1 text-[11.5px] leading-[1.5] text-[#e8b45a]">{syncStatus.message}</p>
      )}

      {/* Preferences */}
      <div className="section-label">Preferences</div>
      <ListCard>
        <ActionRow
          icon={ICONS.clock}
          title="Schedule"
          sub={`Wake ${to12h(settings.wakeTime)} · target bedtime ${to12h(settings.sleepTargetTime)}`}
          onClick={onOpenSettings}
        />
        <ActionRow
          icon={ICONS.labels}
          title="Work labels"
          sub={`"${settings.deepWorkLabel}" · "${settings.lightWorkLabel}"`}
          onClick={onOpenSettings}
        />
        <ActionRow
          icon={ICONS.person}
          title="Biometric profile"
          sub={bioSub}
          onClick={onOpenSettings}
        />
      </ListCard>

      {/* Settings */}
      <div className="section-label">Settings</div>
      <ListCard>
        <InfoRow icon={ICONS.appearance} title="Appearance" value="Dark" tint="text-[#9aa398]" />
        <ActionRow icon={ICONS.signout} title="Sign out" onClick={onSignOut} danger />
      </ListCard>
    </div>
  );
}
