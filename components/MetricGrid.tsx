import MetricCard from "@/components/MetricCard";
import type { HealthDashboardData } from "@/types/health";

interface MetricGridProps {
  data: HealthDashboardData;
}

function getStepsValue(data: HealthDashboardData): string | undefined {
  const rollup = data.steps.data as {
    rollupDataPoints?: Array<{ steps?: { countSum?: number } }>;
  } | undefined;
  const count = rollup?.rollupDataPoints?.[0]?.steps?.countSum;
  return count !== undefined ? `${count.toLocaleString()} steps` : undefined;
}

function getSleepValue(data: HealthDashboardData): string | undefined {
  const sleepData = data.sleep.data as {
    dataPoints?: Array<{
      sleep?: { durationMinutes?: number; efficiencyPercent?: number };
    }>;
  } | undefined;
  const sleep = sleepData?.dataPoints?.[0]?.sleep;
  if (!sleep?.durationMinutes) return undefined;
  const hours = Math.floor(sleep.durationMinutes / 60);
  const mins = sleep.durationMinutes % 60;
  return `${hours}h ${mins}m`;
}

function getRestingHrValue(data: HealthDashboardData): string | undefined {
  const hrData = data.restingHeartRate.data as {
    dataPoints?: Array<{
      dailyRestingHeartRate?: { beatsPerMinute?: number };
    }>;
  } | undefined;
  const bpm = hrData?.dataPoints?.[0]?.dailyRestingHeartRate?.beatsPerMinute;
  return bpm ? `${bpm} bpm` : undefined;
}

function getCaloriesValue(data: HealthDashboardData): string | undefined {
  const rollup = data.totalCalories.data as {
    rollupDataPoints?: Array<{
      totalCalories?: { caloriesSum?: number };
    }>;
  } | undefined;
  const calories = rollup?.rollupDataPoints?.[0]?.totalCalories?.caloriesSum;
  return calories !== undefined ? `${Math.round(calories)} kcal` : undefined;
}

export default function MetricGrid({ data }: MetricGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <MetricCard
        title="Profile"
        value={
          (data.profile.data as { displayName?: string } | undefined)
            ?.displayName
        }
        subtitle="Google Health profile"
        status={data.profile.ok ? "ok" : "error"}
        error={data.profile.error}
        raw={data.profile.data}
      />

      <MetricCard
        title="Steps"
        value={getStepsValue(data)}
        subtitle={`Date: ${data.date}`}
        status={data.steps.ok ? "ok" : "error"}
        error={data.steps.error}
        raw={data.steps.data}
      />

      <MetricCard
        title="Sleep"
        value={getSleepValue(data)}
        subtitle="Last night's sleep"
        status={data.sleep.ok ? "ok" : "error"}
        error={data.sleep.error}
        raw={data.sleep.data}
      />

      <MetricCard
        title="Resting Heart Rate"
        value={getRestingHrValue(data)}
        subtitle="Daily resting HR"
        status={data.restingHeartRate.ok ? "ok" : "error"}
        error={data.restingHeartRate.error}
        raw={data.restingHeartRate.data}
      />

      <MetricCard
        title="Heart Rate"
        value={data.heartRate.ok ? "Rollup available" : undefined}
        subtitle="Intraday heart rate rollup"
        status={data.heartRate.ok ? "ok" : "error"}
        error={data.heartRate.error}
        raw={data.heartRate.data}
      />

      <MetricCard
        title="Heart Rate Variability"
        value={data.heartRateVariability.ok ? "Daily HRV" : undefined}
        subtitle="Daily heart rate variability"
        status={data.heartRateVariability.ok ? "ok" : "error"}
        error={data.heartRateVariability.error}
        raw={data.heartRateVariability.data}
      />

      <MetricCard
        title="Oxygen Saturation (SpO2)"
        value={data.oxygenSaturation.ok ? "Daily SpO2" : undefined}
        subtitle="Blood oxygen"
        status={data.oxygenSaturation.ok ? "ok" : "error"}
        error={data.oxygenSaturation.error}
        raw={data.oxygenSaturation.data}
      />

      <MetricCard
        title="Respiratory Rate"
        value={data.respiratoryRate.ok ? "Daily rate" : undefined}
        subtitle="Breathing rate"
        status={data.respiratoryRate.ok ? "ok" : "error"}
        error={data.respiratoryRate.error}
        raw={data.respiratoryRate.data}
      />

      <MetricCard
        title="Active Minutes"
        value={data.activeMinutes.ok ? "Rollup available" : undefined}
        subtitle="Activity summary"
        status={data.activeMinutes.ok ? "ok" : "error"}
        error={data.activeMinutes.error}
        raw={data.activeMinutes.data}
      />

      <MetricCard
        title="Total Calories"
        value={getCaloriesValue(data)}
        subtitle="Daily calories burned"
        status={data.totalCalories.ok ? "ok" : "error"}
        error={data.totalCalories.error}
        raw={data.totalCalories.data}
      />

      <MetricCard
        title="Distance"
        value={data.distance.ok ? "Rollup available" : undefined}
        subtitle="Daily distance"
        status={data.distance.ok ? "ok" : "error"}
        error={data.distance.error}
        raw={data.distance.data}
      />

      <MetricCard
        title="Sleep Temperature"
        value={data.sleepTemperature.ok ? "Daily deviation" : undefined}
        subtitle="Skin temperature during sleep"
        status={data.sleepTemperature.ok ? "ok" : "error"}
        error={data.sleepTemperature.error}
        raw={data.sleepTemperature.data}
      />
    </div>
  );
}
