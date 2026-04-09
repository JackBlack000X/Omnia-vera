import assert from 'node:assert/strict';
import test from 'node:test';

import { clampYmdNotBeforeYmd, compareYmd, firstDayOfMonthYmd, maxYmd, minYmd } from './date';

test('derives the first day of the month from a YYYY-MM-DD date', () => {
  assert.equal(firstDayOfMonthYmd('2026-04-19'), '2026-04-01');
});

test('keeps dates at or after the minimum and clamps older ones forward', () => {
  assert.equal(clampYmdNotBeforeYmd('2026-04-01', '2026-04-01'), '2026-04-01');
  assert.equal(clampYmdNotBeforeYmd('2026-03-31', '2026-04-01'), '2026-04-01');
});

test('compares YYYY-MM-DD strings lexicographically in chronological order', () => {
  assert.equal(compareYmd('2026-04-01', '2026-04-02'), -1);
  assert.equal(compareYmd('2026-04-02', '2026-04-01'), 1);
  assert.equal(compareYmd('2026-04-01', '2026-04-01'), 0);
  assert.equal(minYmd('2026-04-01', '2026-04-02'), '2026-04-01');
  assert.equal(maxYmd('2026-04-01', '2026-04-02'), '2026-04-02');
});
