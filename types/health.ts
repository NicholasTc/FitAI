export interface HealthEndpointResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export interface HealthDashboardData {
  fetchedAt: string;
  date: string;
  profile: HealthEndpointResult;
  steps: HealthEndpointResult;
  sleep: HealthEndpointResult;
  restingHeartRate: HealthEndpointResult;
  heartRate: HealthEndpointResult;
  heartRateVariability: HealthEndpointResult;
  oxygenSaturation: HealthEndpointResult;
  respiratoryRate: HealthEndpointResult;
  activeMinutes: HealthEndpointResult;
  totalCalories: HealthEndpointResult;
  distance: HealthEndpointResult;
  sleepTemperature: HealthEndpointResult;
}
