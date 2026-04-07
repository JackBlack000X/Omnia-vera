import type { WeatherDay } from './weather';

type HourlySelection = {
  hourDistance: number;
  code: number;
  date: string;
  hour: number;
};

const TARGET_HOUR = 12;

function parseHour(time: string): number | null {
  const hour = Number(time.slice(11, 13));
  return Number.isInteger(hour) ? hour : null;
}

export function deriveDailyWeatherFromHourly(times: string[], codes: number[]): WeatherDay[] {
  const byDate = new Map<string, HourlySelection>();

  for (let i = 0; i < times.length; i += 1) {
    const time = times[i];
    const code = codes[i];
    if (typeof time !== 'string' || typeof code !== 'number') continue;

    const date = time.slice(0, 10);
    const hour = parseHour(time);
    if (!date || hour === null) continue;

    const candidate: HourlySelection = {
      date,
      code,
      hour,
      hourDistance: Math.abs(hour - TARGET_HOUR),
    };

    const existing = byDate.get(date);
    if (
      !existing ||
      candidate.hourDistance < existing.hourDistance ||
      (candidate.hourDistance === existing.hourDistance && candidate.hour < existing.hour)
    ) {
      byDate.set(date, candidate);
    }
  }

  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ date, code }) => ({ date, code }));
}
