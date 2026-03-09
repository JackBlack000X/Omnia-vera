import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

const CACHE_KEY = 'weather_cache_v1';
const CITY_KEY = 'weather_fallback_city_v2'; // stores JSON {name, latitude, longitude}

export type WeatherDay = {
  date: string; // YYYY-MM-DD
  code: number; // WMO weather code
};

type WeatherCache = {
  latitude: number;
  longitude: number;
  fetchedAt: number;
  days: WeatherDay[];
};

// WMO Weather codes -> Ionicons icon name
export function weatherCodeToIcon(code: number): string {
  if (code === 0) return 'sunny';
  if (code <= 3) return 'partly-sunny';
  if (code <= 48) return 'cloud';
  if (code <= 57) return 'rainy';
  if (code <= 67) return 'rainy';
  if (code <= 77) return 'snow';
  if (code <= 82) return 'rainy';
  if (code >= 95) return 'thunderstorm';
  return 'cloud';
}

export function weatherCodeToColor(code: number): string {
  if (code === 0) return '#FFD700';
  if (code <= 3) return '#FFA500';
  if (code <= 48) return '#B0B0B0';
  if (code <= 67) return '#4A90D9';
  if (code <= 77) return '#E0E0E0';
  if (code <= 82) return '#4A90D9';
  if (code >= 95) return '#8B6CC1';
  return '#B0B0B0';
}

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
  // Check fallback city first — if user explicitly set one, use it
  const savedCity = await getFallbackCity();
  if (savedCity) return { latitude: savedCity.latitude, longitude: savedCity.longitude };

  // Try GPS
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      const res = await Location.requestForegroundPermissionsAsync();
      status = res.status;
    }
    if (status === 'granted') {
      const loc = await Location.getLastKnownPositionAsync();
      if (loc) return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      return { latitude: fresh.coords.latitude, longitude: fresh.coords.longitude };
    }
  } catch {}

  return null;
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
  coordsOverride?: { latitude: number; longitude: number }
): Promise<WeatherDay[] | null> {
  // Check cache first (valid for 3 hours)
  const cached = await getCachedWeather();
  if (cached && Date.now() - cached.fetchedAt < 3 * 60 * 60 * 1000) {
    // Filter out past days (keep today + future)
    const today = new Date().toISOString().split('T')[0];
    const validDays = cached.days.filter(d => d.date >= today);
    if (validDays.length > 0) return validDays;
  }

  const coords = coordsOverride ?? (await getCoordinates());
  if (!coords) return cached?.days ?? null;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&daily=weather_code&timezone=Europe%2FZurich&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) return cached?.days ?? null;
    const data = await res.json();

    const days: WeatherDay[] = (data.daily?.time ?? []).map((date: string, i: number) => ({
      date,
      code: data.daily.weather_code[i],
    }));

    await setCachedWeather({
      latitude: coords.latitude,
      longitude: coords.longitude,
      fetchedAt: Date.now(),
      days,
    });

    // Filter out past days
    const today = new Date().toISOString().split('T')[0];
    return days.filter(d => d.date >= today);
  } catch {
    return cached?.days ?? null;
  }
}
