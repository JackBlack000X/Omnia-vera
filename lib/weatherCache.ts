import type { WeatherDay } from './weather';

export type WeatherCoordinates = {
  latitude: number;
  longitude: number;
};

export type WeatherCacheEntry = WeatherCoordinates & {
  fetchedAt: number;
  days: WeatherDay[];
};

export const WEATHER_CACHE_TTL_MS = 3 * 60 * 60 * 1000;

const COORDINATE_EPSILON = 0.0001;

function coordinatesMatch(a: WeatherCoordinates, b: WeatherCoordinates): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < COORDINATE_EPSILON &&
    Math.abs(a.longitude - b.longitude) < COORDINATE_EPSILON
  );
}

export function pickPreferredCoordinates(
  gpsCoordinates: WeatherCoordinates | null,
  fallbackCoordinates: WeatherCoordinates | null,
): WeatherCoordinates | null {
  return gpsCoordinates ?? fallbackCoordinates;
}

export function filterWeatherDaysFromToday(days: WeatherDay[], todayYmd: string): WeatherDay[] {
  return days.filter((day) => day.date >= todayYmd);
}

export function isWeatherCacheUsable(
  cache: WeatherCacheEntry | null,
  requestedCoordinates?: WeatherCoordinates,
  now = Date.now(),
): boolean {
  if (!cache) return false;
  if (now - cache.fetchedAt >= WEATHER_CACHE_TTL_MS) return false;
  if (!requestedCoordinates) return true;

  return coordinatesMatch(cache, requestedCoordinates);
}
