import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

export type LocationPermissionStatus = 'none' | 'foreground' | 'background' | 'denied';

export const GEOFENCE_TASK_NAME = 'omnia-geofence-task';

export function canAskLocationPermission(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export async function getLocationPermissionStatusAsync(): Promise<LocationPermissionStatus> {
  if (!canAskLocationPermission()) return 'denied';
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    const bg = await Location.getBackgroundPermissionsAsync();

    if (bg.granted) return 'background';
    if (fg.granted) return 'foreground';
    if (fg.status === Location.PermissionStatus.DENIED || bg.status === Location.PermissionStatus.DENIED) {
      return 'denied';
    }
    return 'none';
  } catch {
    return 'denied';
  }
}

export async function requestLocationPermissionsAsync(
  kind: 'foreground' | 'background'
): Promise<LocationPermissionStatus> {
  if (!canAskLocationPermission()) return 'denied';

  try {
    if (kind === 'foreground') {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.granted) {
        return 'foreground';
      }
      return fg.status === Location.PermissionStatus.DENIED ? 'denied' : 'none';
    }

    // Background: ensure foreground first
    const currentFg = await Location.getForegroundPermissionsAsync();
    if (!currentFg.granted) {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (!fg.granted) {
        return fg.status === Location.PermissionStatus.DENIED ? 'denied' : 'none';
      }
    }

    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.granted) return 'background';
    return bg.status === Location.PermissionStatus.DENIED ? 'denied' : 'foreground';
  } catch {
    return 'denied';
  }
}

// --- Geofencing scaffolding ---

export type GeofenceRegion = {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
};

export async function startGeofencingForRegions(regions: GeofenceRegion[]): Promise<void> {
  if (!canAskLocationPermission() || regions.length === 0) return;
  try {
    await Location.hasServicesEnabledAsync();
    const hasTask = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
    if (!hasTask) {
      // Task is defined in lib/geofenceTask.ts which is imported at app startup.
    }
    await Location.startGeofencingAsync(
      GEOFENCE_TASK_NAME,
      regions.map((r) => ({
        identifier: r.identifier,
        latitude: r.latitude,
        longitude: r.longitude,
        radius: r.radius,
        notifyOnEnter: false,
        notifyOnExit: true,
      })),
    );
  } catch {
    // swallow errors; callers should handle lack of geofencing gracefully
  }
}

export async function stopGeofencingAsync(): Promise<void> {
  if (!canAskLocationPermission()) return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
    if (isRegistered) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
    }
  } catch {
    // ignore
  }
}

