import AsyncStorage from '@react-native-async-storage/async-storage';

export type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
};

const STORAGE_PLACES = 'omnia_places_v1';

export async function loadPlaces(): Promise<Place[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_PLACES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is Place =>
        p &&
        typeof p.id === 'string' &&
        typeof p.name === 'string' &&
        typeof p.lat === 'number' &&
        typeof p.lng === 'number' &&
        typeof p.radiusMeters === 'number'
    );
  } catch {
    return [];
  }
}

export async function savePlaces(places: Place[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_PLACES, JSON.stringify(places));
  } catch {
    // ignore
  }
}

