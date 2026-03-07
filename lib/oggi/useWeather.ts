import { useCallback, useEffect, useState } from 'react';
import { fetchWeather, WeatherDay } from '@/lib/weather';

export function useWeather(currentDate: Date) {
  const [weatherDays, setWeatherDays] = useState<WeatherDay[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetchWeather().then(days => {
      if (!cancelled && days) setWeatherDays(days);
    });
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Format currentDate as YYYY-MM-DD to match API
  const ymd = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
  const todayWeather = weatherDays.find(d => d.date === ymd) ?? null;

  return { todayWeather, weatherDays, refreshWeather: refresh };
}
