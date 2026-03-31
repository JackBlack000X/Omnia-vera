export type AuthorizationRequestStatus = 'unknown' | 'shouldRequest' | 'unnecessary';

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

export function canUseHealthKit(): boolean {
  return false;
}

export async function getHealthConnectionStateAsync(): Promise<HealthConnectionInfo> {
  return { state: 'unsupported', requestStatus: null };
}

export async function requestHealthAuthorizationAsync(): Promise<boolean> {
  return false;
}

export async function getHealthSnapshotAsync(now = new Date()): Promise<HealthSnapshot> {
  void now;
  throw new Error('HealthKit temporaneamente disattivato.');
}
