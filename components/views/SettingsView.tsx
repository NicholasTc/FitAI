"use client";

import { useEffect, useState } from "react";
import type { UserSettings } from "@/types/today";
import { DEFAULT_SETTINGS } from "@/types/today";

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <div className="rounded-[18px] border border-[rgba(148,162,218,0.14)] bg-white p-5 shadow-[0_2px_14px_rgba(80,100,180,0.06)]">
      <h3 className="mb-4 font-[family-name:var(--font-display)] text-[13px] font-semibold uppercase tracking-[0.12em] text-[#9ea8c4]">
        {title}
      </h3>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

interface FieldRowProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function FieldRow({ label, hint, children }: FieldRowProps) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="sm:w-[180px] sm:shrink-0">
        <p className="text-[13.5px] font-medium text-[#1b2040]">{label}</p>
        {hint && <p className="text-[11.5px] text-[#9ea8c4]">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

const INPUT_CLS =
  "w-full rounded-[10px] border border-[rgba(148,162,218,0.28)] bg-[#f7f8fc] px-3 py-2.5 text-[13.5px] text-[#1b2040] outline-none transition focus:border-[#4a7df6] focus:bg-white focus:ring-2 focus:ring-[rgba(74,125,246,0.12)]";

export default function SettingsView() {
  const [form, setForm] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: UserSettings) => {
        setForm(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function update<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "Save failed");
      }
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <svg className="h-5 w-5 animate-spin text-[#4a7df6]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      {/* Schedule */}
      <SettingsSection title="Schedule">
        <FieldRow
          label="Wake time"
          hint="Used to calculate your wind-down target"
        >
          <input
            type="time"
            value={form.wakeTime}
            onChange={(e) => update("wakeTime", e.target.value)}
            className={INPUT_CLS}
          />
        </FieldRow>

        <div className="border-t border-[rgba(148,162,218,0.1)]" />

        <FieldRow
          label="Target sleep time"
          hint="Your ideal bedtime — used as an upper bound"
        >
          <input
            type="time"
            value={form.sleepTargetTime}
            onChange={(e) => update("sleepTargetTime", e.target.value)}
            className={INPUT_CLS}
          />
        </FieldRow>
      </SettingsSection>

      {/* Work labels */}
      <SettingsSection title="Work labels">
        <FieldRow
          label="Deep work label"
          hint="Cognitively demanding tasks (coding, writing, analysis)"
        >
          <input
            type="text"
            value={form.deepWorkLabel}
            onChange={(e) => update("deepWorkLabel", e.target.value)}
            placeholder={DEFAULT_SETTINGS.deepWorkLabel}
            className={INPUT_CLS}
          />
        </FieldRow>

        <div className="border-t border-[rgba(148,162,218,0.1)]" />

        <FieldRow
          label="Light work label"
          hint="Low-intensity cognitive tasks (email, meetings, admin)"
        >
          <input
            type="text"
            value={form.lightWorkLabel}
            onChange={(e) => update("lightWorkLabel", e.target.value)}
            placeholder={DEFAULT_SETTINGS.lightWorkLabel}
            className={INPUT_CLS}
          />
        </FieldRow>
      </SettingsSection>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-[12px] bg-[#4a7df6] px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_2px_10px_rgba(74,125,246,0.28)] transition hover:bg-[#3a6de0] active:scale-[0.98] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>

        {saved && !saving && (
          <span className="text-[13px] text-[#009e83]">Saved</span>
        )}
        {error && (
          <span className="text-[13px] text-[#e05f3c]">{error}</span>
        )}
      </div>

      <p className="text-[11.5px] text-[#9ea8c4]">
        Changes apply immediately to Today&apos;s Limits. Wind-down time is
        calculated from your wake time and 7-day average sleep.
      </p>
    </div>
  );
}
