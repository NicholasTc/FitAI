"use client";

import MetricGrid from "@/components/MetricGrid";
import type { HealthDashboardData } from "@/types/health";
import { useEffect, useState } from "react";

export default function DashboardContent() {
  const [data, setData] = useState<HealthDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Use the browser's local date (en-CA locale gives YYYY-MM-DD format).
    const localDate = new Date().toLocaleDateString("en-CA");

    fetch(`/api/health/data?date=${localDate}`)
      .then((res) => res.json())
      .then((json: HealthDashboardData) => setData(json))
      .catch(() => setError("Failed to fetch health data."));
  }, []);

  if (error) {
    return (
      <p className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</p>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24 text-[#9ea8c4]">
        <svg
          className="mr-2 h-5 w-5 animate-spin"
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
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
        Loading your health data…
      </div>
    );
  }

  const endpoints = [
    data.profile,
    data.steps,
    data.sleep,
    data.restingHeartRate,
    data.heartRate,
    data.heartRateVariability,
    data.oxygenSaturation,
    data.respiratoryRate,
    data.activeMinutes,
    data.totalCalories,
    data.distance,
    data.sleepTemperature,
  ];
  const successfulEndpoints = endpoints.filter((e) => e.ok).length;

  return (
    <>
      <section className="mb-8 rounded-[22px] border border-[rgba(148,162,218,0.16)] bg-white p-6 shadow-[0_2px_14px_rgba(80,100,180,0.07)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-[#63708f]">Today&apos;s health sync</p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
              All available metrics
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-[#63708f]">
              Data is pulled from the Google Health API (Fitbit data synced to
              your Google account). Some cards may show unavailable if your
              device does not track that metric yet.
            </p>
          </div>
          <div className="rounded-2xl bg-[#f4f5fb] px-4 py-3 text-sm">
            <p className="text-[#9ea8c4]">Endpoints connected</p>
            <p className="font-[family-name:var(--font-display)] text-2xl font-bold">
              {successfulEndpoints}/12
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 text-xs text-[#63708f]">
          <span className="rounded-full bg-[#f4f5fb] px-3 py-1.5">
            Date: {data.date}
          </span>
          <span className="rounded-full bg-[#f4f5fb] px-3 py-1.5">
            Fetched: {new Date(data.fetchedAt).toLocaleString()}
          </span>
          <a
            href={`/api/health/data?date=${data.date}`}
            className="rounded-full bg-[#eef3ff] px-3 py-1.5 font-medium text-[#4a7df6]"
          >
            Raw API JSON
          </a>
        </div>
      </section>

      <MetricGrid data={data} />
    </>
  );
}
