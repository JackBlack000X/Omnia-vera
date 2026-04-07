import assert from 'node:assert/strict';

import {
  WEATHER_FALLBACK_SYMBOL,
  weatherCodeToColor,
  weatherCodeToIcon,
} from '../lib/weatherSymbols';

assert.equal(weatherCodeToIcon(0), 'sun.max.fill');
assert.equal(weatherCodeToIcon(2), 'cloud.sun.fill');
assert.equal(weatherCodeToIcon(45), 'cloud.fill');
assert.equal(weatherCodeToIcon(55), 'cloud.drizzle.fill');
assert.equal(weatherCodeToIcon(75), 'cloud.snow.fill');
assert.equal(weatherCodeToIcon(96), 'cloud.bolt.rain.fill');
assert.equal(weatherCodeToIcon(999), WEATHER_FALLBACK_SYMBOL);

assert.equal(weatherCodeToColor(0), '#FFD700');
assert.equal(weatherCodeToColor(55), '#4A90D9');
assert.equal(weatherCodeToColor(75), '#E0E0E0');
assert.equal(weatherCodeToColor(96), '#8B6CC1');

console.log('weather symbol mapping ok');
