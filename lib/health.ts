import {
  AuthorizationRequestStatus,
  CategoryValueSleepAnalysis,
  getRequestStatusForAuthorization,
  isHealthDataAvailableAsync,
  queryCategorySamples,
  queryStatisticsForQuantity,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import { Platform } from 'react-native';

const HEALTH_READ_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKCategoryTypeIdentifierSleepAnalysis',
] as const;

const SLEEP_ASLEEP_VALUES = new Set<number>([
  CategoryValueSleepAnalysis.asleepUnspecified,
  CategoryValueSleepAnalysis.asleepCore,
  CategoryValueSleepAnalysis.asleepDeep,
  CategoryValueSleepAnalysis.asleepREM,
]);

export type HealthConnectionState =
  | 'unsupported'
  | 'unavailable'
  | 'needsAuthorization'
  | 'ready'
  | 'unknown';

export type HealthConnectionInfo = {
  state: HealthConnectionState;
  requestStatus: AuthorizationRequestStatus | null;
};

export type HealthSnapshot = {
  stepsToday: number;
  walkingRunningDistanceKmToday: number;
  activeEnergyBurnedKcalToday: number;
  sleepMinutesLastNight: number;
  lastUpdatedAt: string;
};

function isIosHealthSupported(): boolean {
  return Platform.OS === 'ios';
}

function getTodayRange(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { start, end: now };
}

function getLastNightRange(now = new Date()): { start: Date; end: Date } {
  const midday = new Date(now);
  midday.setHours(12, 0, 0, 0);

  const end = now.getTime() >= midday.getTime() ? midday : now;
  const start = new Date(end);
  start.setDate(start.getDate() - 1);
  start.setHours(18, 0, 0, 0);

  return { start, end };
}

function mergeIntervals(intervals: Array<{ start: number; end: number }>): number {
  if (intervals.length === 0) return 0;

  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let totalMs = 0;
  let currentStart = sorted[0].start;
  let currentEnd = sorted[0].end;

  for (let i = 1; i < sorted.length; i += 1) {
    const interval = sorted[i];
    if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
      continue;
    }

    totalMs += currentEnd - currentStart;
    currentStart = interval.start;
    currentEnd = interval.end;
  }

  totalMs += currentEnd - currentStart;
  return totalMs;
}

async function getCumulativeQuantity(
  identifier:
    | 'HKQuantityTypeIdentifierStepCount'
    | 'HKQuantityTypeIdentifierDistanceWalkingRunning'
    | 'HKQuantityTypeIdentifierActiveEnergyBurned',
  unit: 'count' | 'km' | 'kcal',
  range: { start: Date; end: Date },
): Promise<number> {
  const stats = await queryStatisticsForQuantity(identifier, ['cumulativeSum'], {
    unit,
    filter: {
      date: {
        startDate: range.start,
        endDate: range.end,
      },
    },
  });

  return Math.max(0, Math.round(stats.sumQuantity?.quantity ?? 0));
}

async function getWalkingRunningDistanceKmToday(range: { start: Date; end: Date }): Promise<number> {
  const stats = await queryStatisticsForQuantity('HKQuantityTypeIdentifierDistanceWalkingRunning', ['cumulativeSum'], {
    unit: 'km',
    filter: {
      date: {
        startDate: range.start,
        endDate: range.end,
      },
    },
  });

  const value = stats.sumQuantity?.quantity ?? 0;
  return Math.max(0, Math.round(value * 10) / 10);
}

async function getSleepMinutesLastNight(range: { start: Date; end: Date }): Promise<number> {
  const samples = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
    limit: -1,
    ascending: true,
    filter: {
      date: {
        startDate: range.start,
        endDate: range.end,
      },
    },
  });

  const asleepIntervals = samples
    .filter((sample) => SLEEP_ASLEEP_VALUES.has(Number(sample.value)))
    .map((sample) => ({
      start: sample.startDate.getTime(),
      end: sample.endDate.getTime(),
    }))
    .filter((interval) => interval.end > interval.start);

  return Math.round(mergeIntervals(asleepIntervals) / 60000);
}

export function canUseHealthKit(): boolean {
  return isIosHealthSupported();
}

export async function getHealthConnectionStateAsync(): Promise<HealthConnectionInfo> {
  if (!isIosHealthSupported()) {
    return { state: 'unsupported', requestStatus: null };
  }

  const isAvailable = await isHealthDataAvailableAsync();
  if (!isAvailable) {
    return { state: 'unavailable', requestStatus: null };
  }

  const requestStatus = await getRequestStatusForAuthorization({
    toRead: HEALTH_READ_TYPES,
  });

  switch (requestStatus) {
    case AuthorizationRequestStatus.unnecessary:
      return { state: 'ready', requestStatus };
    case AuthorizationRequestStatus.shouldRequest:
      return { state: 'needsAuthorization', requestStatus };
    case AuthorizationRequestStatus.unknown:
    default:
      return { state: 'unknown', requestStatus };
  }
}

export async function requestHealthAuthorizationAsync(): Promise<boolean> {
  if (!isIosHealthSupported()) return false;

  const isAvailable = await isHealthDataAvailableAsync();
  if (!isAvailable) return false;

  return requestAuthorization({
    toRead: HEALTH_READ_TYPES,
  });
}

export async function getHealthSnapshotAsync(now = new Date()): Promise<HealthSnapshot> {
  if (!isIosHealthSupported()) {
    throw new Error('HealthKit non supportato su questa piattaforma.');
  }

  const todayRange = getTodayRange(now);
  const lastNightRange = getLastNightRange(now);

  const [stepsToday, walkingRunningDistanceKmToday, activeEnergyBurnedKcalToday, sleepMinutesLastNight] = await Promise.all([
    getCumulativeQuantity('HKQuantityTypeIdentifierStepCount', 'count', todayRange),
    getWalkingRunningDistanceKmToday(todayRange),
    getCumulativeQuantity('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', todayRange),
    getSleepMinutesLastNight(lastNightRange),
  ]);

  return {
    stepsToday,
    walkingRunningDistanceKmToday,
    activeEnergyBurnedKcalToday,
    sleepMinutesLastNight,
    lastUpdatedAt: now.toISOString(),
  };
}
