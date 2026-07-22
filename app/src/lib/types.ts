/** Shapes of the JSON produced by scripts/export_data.py and export_details.py. */

export type SportGroup = "run" | "ride" | "swim" | "gym" | "hike" | "walk" | "other";

/** One entry of activities.json — the index. Detail lives in activity/<id>.json. */
export interface ActivityIndex {
  activityId: number;
  activityName?: string;
  startTimeLocal?: string;
  typeKey?: string;
  eventType?: string | null;
  duration?: number;
  movingDuration?: number;
  distance?: number;
  calories?: number;
  averageHR?: number;
  maxHR?: number;
  averageSpeed?: number;
  /** Garmin's own moving-average speed. averageSpeed is the elapsed figure. */
  averageMovingSpeed?: number;
  maxSpeed?: number;
  elevationGain?: number;
  elevationLoss?: number;
  steps?: number;
  aerobicTrainingEffect?: number;
  anaerobicTrainingEffect?: number;
  trainingEffectLabel?: string;
  activityTrainingLoad?: number;
  vO2MaxValue?: number;
  avgPower?: number;
  maxPower?: number;
  normPower?: number;
  moderateIntensityMinutes?: number;
  vigorousIntensityMinutes?: number;
  totalSets?: number;
  totalReps?: number;
  activeSets?: number;
  poolLength?: number;
  strokes?: number;
  lapCount?: number;
  locationName?: string;
  averageRunningCadenceInStepsPerMinute?: number;
  avgStrideLength?: number;
}

/** Derived at load time — never exported. */
export interface Activity extends ActivityIndex {
  /** ISO date, YYYY-MM-DD */
  date: string;
  group: SportGroup;
}

export interface Lap {
  lapIndex?: number;
  distance?: number;
  duration?: number;
  movingDuration?: number;
  averageSpeed?: number;
  maxSpeed?: number;
  averageHR?: number;
  maxHR?: number;
  calories?: number;
  elevationGain?: number;
  elevationLoss?: number;
  averageRunCadence?: number;
  strideLength?: number;
  groundContactTime?: number;
  verticalOscillation?: number;
  verticalRatio?: number;
  averagePower?: number;
  maxPower?: number;
  normalizedPower?: number;
  averageBikeCadence?: number;
  averageSWOLF?: number;
  averageStrokes?: number;
  averageSwimCadence?: number;
  swimStroke?: string;
  numberOfActiveLengths?: number;
  averageStrokeDistance?: number;
  startLatitude?: number;
  startLongitude?: number;
}

export interface SwimLength {
  duration?: number;
  averageSWOLF?: number;
  totalNumberOfStrokes?: number;
  averageSwimCadence?: number;
  swimStroke?: string;
  messageIndex?: number;
}

export interface ZoneBucket {
  zone: number;
  secs: number;
  floor: number;
}

export interface ActivityWeather {
  tempF?: number;
  apparentTempF?: number;
  dewPointF?: number;
  humidity?: number;
  windSpeed?: number;
  windGust?: number | null;
  windDirection?: string;
  desc?: string;
}

/** activity/<id>.json */
export interface ActivityDetail {
  activityId: number;
  typeKey: string;
  name?: string;
  startTimeLocal?: string;
  summary: Record<string, number | string>;
  running?: {
    averageRunCadence?: number;
    maxRunCadence?: number;
    strideLength?: number;
    steps?: number;
    groundContactTime?: number;
    groundContactBalanceLeft?: number;
    verticalOscillation?: number;
    verticalRatio?: number;
    lactateThresholdHeartRate?: number;
    lactateThresholdSpeed?: number;
    maxVerticalSpeed?: number;
  };
  cycling?: {
    averagePower?: number;
    maxPower?: number;
    normalizedPower?: number;
    trainingStressScore?: number;
    intensityFactor?: number;
    averageBikeCadence?: number;
    maxBikeCadence?: number;
    totalWork?: number;
    leftRightBalance?: number;
    beginPotentialStamina?: number;
    endPotentialStamina?: number;
    minAvailableStamina?: number;
  };
  swimming?: {
    averageSWOLF?: number;
    averageStrokes?: number;
    totalNumberOfStrokes?: number;
    averageSwimCadence?: number;
    poolLength?: number;
    numberOfActiveLengths?: number;
  };
  gps?: {
    startLatitude?: number;
    startLongitude?: number;
    endLatitude?: number;
    endLongitude?: number;
  };
  laps?: Lap[];
  lengths?: SwimLength[];
  hrZones?: ZoneBucket[];
  powerZones?: ZoneBucket[];
  weather?: ActivityWeather;
}

export interface LoadPoint {
  date: string;
  load: number;
  ctl: number;
  atl: number;
  tsb: number;
  acwr: number | null;
}

export interface DailyData {
  steps?: { calendarDate: string; totalSteps: number | null; stepGoal: number | null }[];
  stress?: {
    calendarDate: string;
    values: {
      overallStressLevel: number | null;
      restStressDuration?: number;
      lowStressDuration?: number;
      mediumStressDuration?: number;
      highStressDuration?: number;
    };
  }[];
  rhr?: { calendarDate: string; values: { restingHR: number | null } }[];
  sleep_scores?: {
    date: string;
    score: number | null;
    total_s: number;
    deep_s?: number;
    light_s?: number;
    rem_s?: number;
    awake_s?: number;
  }[];
  body_battery?: {
    date: string;
    charged: number | null;
    drained: number | null;
    highest: number | null;
    lowest: number | null;
  }[];
  vo2max?: { date: string; vo2max: number | null }[];
  intensity_minutes_weekly?: {
    calendarDate: string;
    weeklyGoal: number;
    moderateValue: number | null;
    vigorousValue: number | null;
  }[];
  /** Present but empty on FR945 — the watch has no HRV/Readiness sensor stack. */
  hrv?: unknown[];
  readiness?: unknown[];
}

export interface RacePrediction {
  calendarDate: string;
  time5K: number | null;
  time10K: number | null;
  timeHalfMarathon: number | null;
  timeMarathon: number | null;
}

export interface LoadBalance {
  monthlyLoadAerobicLow?: number;
  monthlyLoadAerobicHigh?: number;
  monthlyLoadAnaerobic?: number;
  monthlyLoadAerobicLowTargetMin?: number;
  monthlyLoadAerobicLowTargetMax?: number;
  monthlyLoadAerobicHighTargetMin?: number;
  monthlyLoadAerobicHighTargetMax?: number;
  monthlyLoadAnaerobicTargetMin?: number;
  monthlyLoadAnaerobicTargetMax?: number;
  trainingBalanceFeedbackPhrase?: string;
}

export interface FitnessData {
  training_status?: {
    mostRecentVO2Max?: { generic?: { vo2MaxPreciseValue?: number; calendarDate?: string } };
    mostRecentTrainingLoadBalance?: {
      metricsTrainingLoadBalanceDTOMap?: Record<string, LoadBalance>;
    };
    mostRecentTrainingStatus?: {
      latestTrainingStatusData?: Record<string, { trainingStatusFeedbackPhrase?: string; weeklyTrainingLoad?: number }>;
    };
  };
  race_predictions?: RacePrediction;
  race_predictions_history?: RacePrediction[];
  hr_zones?: {
    sport: string;
    zone1Floor: number;
    zone2Floor: number;
    zone3Floor: number;
    zone4Floor: number;
    zone5Floor: number;
    maxHeartRateUsed: number;
    lactateThresholdHeartRateUsed: number | null;
  }[];
}

export interface PersonalRecord {
  type_id: number;
  value: number;
  date?: string;
  activity_id?: number;
  activity_name?: string;
}

export interface Profile {
  full_name?: string;
  unit_system?: string;
  user?: {
    gender?: string;
    weight_g?: number;
    height_cm?: number;
    vo2max_running?: number;
    lactate_threshold_speed?: number;
    lactate_threshold_hr?: number;
  };
  devices?: { name?: string; primary?: boolean }[];
}

export interface Manifest {
  generated_at: string;
  sections: Record<string, { ok: boolean; count?: number; error?: string }>;
}

/** Everything the client loads on boot. */
export interface GarminData {
  manifest: Manifest | null;
  profile: Profile | null;
  activities: Activity[];
  daily: DailyData;
  fitness: FitnessData;
  records: { personal_records?: PersonalRecord[] } | null;
  loadTrend: LoadPoint[];
  strength: { activity_id: number; date: string; sets: { exercise?: string; reps?: number; weight_g?: number }[] }[];
  /** Export date — "today" for every derived calculation. */
  today: string;
}
