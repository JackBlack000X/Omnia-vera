export type WeatherSymbolName =
  | 'sun.max.fill'
  | 'cloud.sun.fill'
  | 'cloud.fill'
  | 'cloud.drizzle.fill'
  | 'cloud.snow.fill'
  | 'cloud.bolt.rain.fill'
  | 'wind';

export const WEATHER_FALLBACK_SYMBOL: WeatherSymbolName = 'cloud.fill';

export function weatherCodeToIcon(code: number): WeatherSymbolName {
  if (code === 0) return 'sun.max.fill';
  if (code <= 3) return 'cloud.sun.fill';
  if (code <= 48) return 'cloud.fill';
  if (code <= 67) return 'cloud.drizzle.fill';
  if (code <= 77) return 'cloud.snow.fill';
  if (code <= 82) return 'cloud.drizzle.fill';
  if (code >= 95 && code <= 99) return 'cloud.bolt.rain.fill';
  return WEATHER_FALLBACK_SYMBOL;
}

export function weatherCodeToColor(code: number): string {
  if (code === 0) return '#FFD700';
  if (code <= 3) return '#FFA500';
  if (code <= 48) return '#B0B0B0';
  if (code <= 67) return '#4A90D9';
  if (code <= 77) return '#E0E0E0';
  if (code <= 82) return '#4A90D9';
  if (code >= 95 && code <= 99) return '#8B6CC1';
  return '#B0B0B0';
}
