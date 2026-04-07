import assert from 'node:assert/strict';

import {
  filterWeatherDaysFromToday,
  isWeatherCacheUsable,
  pickPreferredCoordinates,
  type WeatherCacheEntry,
} from '../lib/weatherCache';

const sampleCache: WeatherCacheEntry = {
  latitude: 45.4642,
  longitude: 9.19,
  fetchedAt: Date.now(),
  days: [
    { date: '2026-04-06', code: 3 },
    { date: '2026-04-07', code: 0 },
    { date: '2026-04-08', code: 61 },
  ],
};

assert.deepEqual(
  filterWeatherDaysFromToday(sampleCache.days, '2026-04-07'),
  [
    { date: '2026-04-07', code: 0 },
    { date: '2026-04-08', code: 61 },
  ],
);

assert.equal(
  isWeatherCacheUsable(sampleCache, { latitude: 45.4642, longitude: 9.19 }, sampleCache.fetchedAt + 1),
  true,
);

assert.equal(
  isWeatherCacheUsable(sampleCache, { latitude: 47.3769, longitude: 8.5417 }, sampleCache.fetchedAt + 1),
  false,
);

assert.equal(
  isWeatherCacheUsable(sampleCache, undefined, sampleCache.fetchedAt + 4 * 60 * 60 * 1000),
  false,
);

assert.deepEqual(
  pickPreferredCoordinates(
    { latitude: 47.3769, longitude: 8.5417 },
    { latitude: 45.4642, longitude: 9.19 },
  ),
  { latitude: 47.3769, longitude: 8.5417 },
);

assert.deepEqual(
  pickPreferredCoordinates(
    null,
    { latitude: 45.4642, longitude: 9.19 },
  ),
  { latitude: 45.4642, longitude: 9.19 },
);

console.log('weather cache logic ok');
