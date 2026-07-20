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
    <div className="gcard p-5">
      <h3 className="mb-4 text-[10.5px] font-[650] uppercase tracking-[1.4px] text-[#6d766b]">
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
      <div className="sm:w-[190px] sm:shrink-0">
        <p className="text-[13.5px] font-medium text-[#f4f6f2]">{label}</p>
        {hint && <p className="text-[11.5px] text-[#6d766b]">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

const INPUT_CLS =
  "w-full rounded-[11px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-3.5 py-2.5 text-[13.5px] text-[#f4f6f2] placeholder-[#6d766b] outline-none transition [color-scheme:dark] focus:border-[rgba(183,236,74,0.4)]";

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
        <svg className="h-5 w-5 animate-spin text-[#b7ec4a]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="screen-in mx-auto flex max-w-xl flex-col gap-4">
      {/* Profile */}
      <SettingsSection title="Biometric profile">
        <FieldRow label="Age" hint="Used for age-adjusted HRV thresholds">
          <input
            type="number"
            min={10}
            max={99}
            value={form.age ?? ""}
            onChange={(e) => update("age", e.target.value ? Number(e.target.value) : null)}
            placeholder="e.g. 26"
            className={INPUT_CLS}
          />
        </FieldRow>

        <div className="border-t border-[rgba(255,255,255,0.06)]" />

        <FieldRow label="Sex" hint="Used for BMR calculation and HRV norms">
          <select
            value={form.sex ?? ""}
            onChange={(e) => update("sex", (e.target.value as "male" | "female") || null)}
            className={INPUT_CLS}
          >
            <option value="">Prefer not to say</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </FieldRow>

        <div className="border-t border-[rgba(255,255,255,0.06)]" />

        <FieldRow label="Height (cm)" hint="Used with weight to compute BMR">
          <input
            type="number"
            min={100}
            max={250}
            value={form.heightCm ?? ""}
            onChange={(e) => update("heightCm", e.target.value ? Number(e.target.value) : null)}
            placeholder="e.g. 175"
            className={INPUT_CLS}
          />
        </FieldRow>

        <div className="border-t border-[rgba(255,255,255,0.06)]" />

        <FieldRow label="Weight (kg)" hint="Used to estimate your daily calorie baseline (BMR)">
          <input
            type="number"
            min={20}
            max={300}
            value={form.weightKg ?? ""}
            onChange={(e) => update("weightKg", e.target.value ? Number(e.target.value) : null)}
            placeholder="e.g. 75"
            className={INPUT_CLS}
          />
        </FieldRow>

        <p className="pt-1 text-[11px] text-[#6d766b]">
          Height and weight are only used to estimate your resting calorie burn (BMR). They are
          stored securely and never shared.
        </p>
      </SettingsSection>

      {/* Schedule */}
      <SettingsSection title="Schedule">
        <FieldRow label="Wake time" hint="Used to calculate your wind-down target">
          <input
            type="time"
            value={form.wakeTime}
            onChange={(e) => update("wakeTime", e.target.value)}
            className={INPUT_CLS}
          />
        </FieldRow>

        <div className="border-t border-[rgba(255,255,255,0.06)]" />

        <FieldRow label="Target sleep time" hint="Your ideal bedtime — used as an upper bound">
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
        <FieldRow label="Deep work label" hint="Cognitively demanding tasks (coding, writing, analysis)">
          <input
            type="text"
            value={form.deepWorkLabel}
            onChange={(e) => update("deepWorkLabel", e.target.value)}
            placeholder={DEFAULT_SETTINGS.deepWorkLabel}
            className={INPUT_CLS}
          />
        </FieldRow>

        <div className="border-t border-[rgba(255,255,255,0.06)]" />

        <FieldRow label="Light work label" hint="Low-intensity cognitive tasks (email, meetings, admin)">
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
          className="rounded-full border border-[rgba(183,236,74,0.4)] bg-[rgba(183,236,74,0.14)] px-6 py-2.5 text-[13.5px] font-bold text-[#b7ec4a] transition hover:bg-[rgba(183,236,74,0.2)] active:scale-[0.98] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>

        {saved && !saving && <span className="text-[13px] font-semibold text-[#b7ec4a]">Saved</span>}
        {error && <span className="text-[13px] text-[#ef5b5b]">{error}</span>}
      </div>

      <p className="text-[11.5px] leading-[1.5] text-[#6d766b]">
        Changes apply immediately to Today&apos;s Limits. Wind-down time is calculated from your wake
        time and 7-day average sleep.
      </p>
    </div>
  );
}
