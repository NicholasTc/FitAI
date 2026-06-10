export interface FitbitProfileResponse {
  user: {
    encodedId: string;
    displayName: string;
    avatar150?: string;
    age?: number;
    gender?: string;
    height?: number;
    weight?: number;
    dateOfBirth?: string;
  };
}

export interface FitbitSleepResponse {
  sleep?: Array<{
    dateOfSleep: string;
    duration: number;
    efficiency: number;
    minutesAsleep: number;
    minutesAwake: number;
    minutesToFallAsleep: number;
    timeInBed: number;
    levels?: {
      summary?: {
        deep?: { minutes: number };
        light?: { minutes: number };
        rem?: { minutes: number };
        wake?: { minutes: number };
      };
    };
  }>;
  summary?: {
    totalMinutesAsleep?: number;
    totalTimeInBed?: number;
    totalSleepRecords?: number;
  };
}

export interface FitbitHeartResponse {
  "activities-heart"?: Array<{
    dateTime: string;
    value: {
      restingHeartRate?: number;
      heartRateZones?: Array<{
        name: string;
        min: number;
        max: number;
        minutes: number;
        caloriesOut: number;
      }>;
    };
  }>;
}

export interface FitbitActivityResponse {
  summary?: {
    steps?: number;
    caloriesOut?: number;
    fairlyActiveMinutes?: number;
    lightlyActiveMinutes?: number;
    veryActiveMinutes?: number;
    sedentaryMinutes?: number;
    distances?: Array<{ activity: string; distance: number }>;
    floors?: number;
    elevation?: number;
  };
  goals?: {
    steps?: number;
    caloriesOut?: number;
    activeMinutes?: number;
  };
}

export interface FitbitSpO2Response {
  dateTime?: string;
  value?: {
    avg?: number;
    min?: number;
    max?: number;
  };
}

export interface FitbitBreathingRateResponse {
  br?: Array<{
    dateTime: string;
    value: {
      breathingRate: number;
    };
  }>;
}

export interface FitbitHRVResponse {
  hrv?: Array<{
    dateTime: string;
    value: {
      dailyRmssd?: number;
      deepRmssd?: number;
    };
  }>;
}

export interface FitbitSkinTempResponse {
  tempSkin?: Array<{
    dateTime: string;
    value: {
      nightlyRelative?: number;
      type?: string;
    };
  }>;
}

export interface FitbitEndpointResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export interface FitbitDashboardData {
  fetchedAt: string;
  date: string;
  profile: FitbitEndpointResult<FitbitProfileResponse>;
  sleep: FitbitEndpointResult<FitbitSleepResponse>;
  heart: FitbitEndpointResult<FitbitHeartResponse>;
  activity: FitbitEndpointResult<FitbitActivityResponse>;
  spo2: FitbitEndpointResult<FitbitSpO2Response>;
  breathingRate: FitbitEndpointResult<FitbitBreathingRateResponse>;
  hrv: FitbitEndpointResult<FitbitHRVResponse>;
  skinTemperature: FitbitEndpointResult<FitbitSkinTempResponse>;
}
