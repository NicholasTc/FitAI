import type { FitAIIconName } from "@/types/icons";
import type { ComponentType } from "react";
import {
  IoAnalyticsOutline,
  IoCheckmarkCircle,
  IoCreateOutline,
  IoFlashOutline,
  IoFootstepsOutline,
  IoHeartOutline,
  IoInformationCircleOutline,
  IoMoonOutline,
  IoPulseOutline,
  IoShieldCheckmarkOutline,
  IoSparklesOutline,
  IoStatsChartOutline,
  IoTodayOutline,
  IoTrendingUpOutline,
  IoWarningOutline,
  IoFlagOutline,
  IoJournalOutline,
  IoCalendarOutline,
  IoStarOutline,
  IoRemoveCircleOutline,
  IoBarbell,
  IoFlameOutline,
  IoSettingsOutline,
} from "react-icons/io5";

export type { FitAIIconName } from "@/types/icons";

const ICONS: Record<
  FitAIIconName,
  ComponentType<{ className?: string; size?: number | string }>
> = {
  sleep: IoMoonOutline,
  heart: IoHeartOutline,
  hrv: IoPulseOutline,
  energy: IoFlashOutline,
  stress: IoWarningOutline,
  "stress-low": IoShieldCheckmarkOutline,
  motivation: IoFlagOutline,
  steps: IoFootstepsOutline,
  checkin: IoCreateOutline,
  today: IoTodayOutline,
  trends: IoTrendingUpOutline,
  baseline: IoAnalyticsOutline,
  info: IoInformationCircleOutline,
  check: IoCheckmarkCircle,
  chart: IoStatsChartOutline,
  ai: IoSparklesOutline,
  reflect: IoJournalOutline,
  week: IoCalendarOutline,
  star: IoStarOutline,
  skip: IoRemoveCircleOutline,
  workout: IoBarbell,
  settings: IoSettingsOutline,
  calories: IoFlameOutline,
};

interface AppIconProps {
  name: FitAIIconName;
  className?: string;
  size?: number;
}

export function AppIcon({ name, className = "", size = 18 }: AppIconProps) {
  const Icon = ICONS[name];
  return <Icon className={className} size={size} aria-hidden />;
}
