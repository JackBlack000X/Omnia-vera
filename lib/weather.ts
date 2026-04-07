import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {
  filterWeatherDaysFromToday,
  isWeatherCacheUsable,
  pickPreferredCoordinates,
  type WeatherCacheEntry,
  type WeatherCoordinates,
} from './weatherCache';
import { deriveDailyWeatherFromHourly } from './weatherForecast';

export { WEATHER_FALLBACK_SYMBOL, weatherCodeToColor, weatherCodeToIcon, type WeatherSymbolName } from './weatherSymbols';
export {
  filterWeatherDaysFromToday,
  isWeatherCacheUsable,
  pickPreferredCoordinates,
  type WeatherCacheEntry,
  type WeatherCoordinates,
} from './weatherCache';

const CACHE_KEY = 'weather_cache_v2';
const CITY_KEY = 'weather_fallback_city_v2'; // stores JSON {name, latitude, longitude}

export type WeatherDay = {
  date: string; // YYYY-MM-DD
  code: number; // WMO weather code
};

type WeatherCache = WeatherCacheEntry;

// Known cities for fallback (no GPS)
export const FALLBACK_CITIES: { name: string; latitude: number; longitude: number }[] = [
  { name: 'Roma', latitude: 41.9028, longitude: 12.4964 },
  { name: 'Milano', latitude: 45.4642, longitude: 9.19 },
  { name: 'Napoli', latitude: 40.8518, longitude: 14.2681 },
  { name: 'Torino', latitude: 45.0703, longitude: 7.6869 },
  { name: 'Firenze', latitude: 43.7696, longitude: 11.2558 },
  { name: 'Bologna', latitude: 44.4949, longitude: 11.3426 },
  { name: 'Genova', latitude: 44.4056, longitude: 8.9463 },
  { name: 'Venezia', latitude: 45.4408, longitude: 12.3155 },
  { name: 'Palermo', latitude: 38.1157, longitude: 13.3615 },
  { name: 'Zurigo', latitude: 47.3769, longitude: 8.5417 },
  { name: 'Londra', latitude: 51.5074, longitude: -0.1278 },
  { name: 'Parigi', latitude: 48.8566, longitude: 2.3522 },
  { name: 'Berlino', latitude: 52.52, longitude: 13.405 },
  { name: 'New York', latitude: 40.7128, longitude: -74.006 },
];

export type CityInfo = { name: string; latitude: number; longitude: number };

export async function getFallbackCity(): Promise<CityInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(CITY_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setFallbackCity(city: CityInfo | null): Promise<void> {
  if (!city) {
    await AsyncStorage.removeItem(CITY_KEY);
  } else {
    await AsyncStorage.setItem(CITY_KEY, JSON.stringify(city));
  }
}

export async function searchCities(query: string): Promise<CityInfo[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=8&language=it`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.results) return [];
    return data.results.map((r: any) => ({
      name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
      latitude: r.latitude,
      longitude: r.longitude,
    }));
  } catch {
    return [];
  }
}

export async function clearWeatherCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}

async function getCoordinates(): Promise<{ latitude: number; longitude: number } | null> {
  const savedCity = await getFallbackCity();
  const fallbackCoordinates = savedCity
    ? { latitude: savedCity.latitude, longitude: savedCity.longitude }
    : null;

  // Prefer GPS for the local forecast, then fall back to the saved city.
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      const res = await Location.requestForegroundPermissionsAsync();
      status = res.status;
    }
    if (status === 'granted') {
      const loc = await Location.getLastKnownPositionAsync();
      if (loc) {
        return pickPreferredCoordinates(
          { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
          fallbackCoordinates,
        );
      }
      const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      return pickPreferredCoordinates(
        { latitude: fresh.coords.latitude, longitude: fresh.coords.longitude },
        fallbackCoordinates,
      );
    }
  } catch {}

  return fallbackCoordinates;
}

async function getCachedWeather(): Promise<WeatherCache | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setCachedWeather(cache: WeatherCache): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export async function fetchWeather(
  coordsOverride?: WeatherCoordinates
): Promise<WeatherDay[] | null> {
  const cached = await getCachedWeather();
  const today = new Date().toISOString().split('T')[0];
  const coords = coordsOverride ?? (await getCoordinates());
  const cachedValidDays = cached ? filterWeatherDaysFromToday(cached.days, today) : [];

  if (coords && isWeatherCacheUsable(cached, coords)) {
    if (cachedValidDays.length > 0) return cachedValidDays;
  }

  if (!coords) {
    return cachedValidDays.length > 0 ? cachedValidDays : null;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&hourly=weather_code&timezone=Europe%2FZurich&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) return cachedValidDays.length > 0 ? cachedValidDays : null;
    const data = await res.json();

    const days = deriveDailyWeatherFromHourly(
      data.hourly?.time ?? [],
      data.hourly?.weather_code ?? [],
    );

    await setCachedWeather({
      latitude: coords.latitude,
      longitude: coords.longitude,
      fetchedAt: Date.now(),
      days,
    });

    return filterWeatherDaysFromToday(days, today);
  } catch {
    return cachedValidDays.length > 0 ? cachedValidDays : null;
  }
}
