import assert from 'node:assert/strict';

import { deriveDailyWeatherFromHourly } from '../lib/weatherForecast';

const romeTimes = [
  '2026-04-07T07:00',
  '2026-04-07T08:00',
  '2026-04-07T12:00',
  '2026-04-07T13:00',
  '2026-04-08T07:00',
  '2026-04-08T12:00',
  '2026-04-08T13:00',
  '2026-04-09T07:00',
  '2026-04-09T12:00',
  '2026-04-10T12:00',
  '2026-04-11T12:00',
  '2026-04-12T12:00',
  '2026-04-13T12:00',
];

const romeCodes = [
  45,
  1,
  0,
  1,
  45,
  0,
  0,
  45,
  0,
  1,
  1,
  3,
  80,
];

assert.deepEqual(
  deriveDailyWeatherFromHourly(romeTimes, romeCodes),
  [
    { date: '2026-04-07', code: 0 },
    { date: '2026-04-08', code: 0 },
    { date: '2026-04-09', code: 0 },
    { date: '2026-04-10', code: 1 },
    { date: '2026-04-11', code: 1 },
    { date: '2026-04-12', code: 3 },
    { date: '2026-04-13', code: 80 },
  ],
);

console.log('weather forecast derivation ok');
