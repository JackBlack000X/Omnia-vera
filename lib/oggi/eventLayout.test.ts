import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateEventVerticalMetrics } from './eventLayout';

function getHourLineTop(hourMinute: number, windowStartMin: number, hourHeight: number) {
  return ((hourMinute - windowStartMin) / 60) * hourHeight;
}

test('keeps the five-hour placement unchanged for a short pre-hour event', () => {
  const metrics = calculateEventVerticalMetrics({
    startM: 6 * 60 + 55,
    endM: 7 * 60,
    windowStartMin: 6 * 60,
    windowEndMin: 11 * 60,
    hourHeight: 96,
    fiveHourReferenceHeight: 96,
  });

  assert.deepEqual(metrics, {
    top: 90,
    height: 4.25,
  });
});

test('keeps the same offset from the ending hour line when zooming out a short pre-hour event', () => {
  const fiveHourReferenceHeight = 96;
  const atFiveHours = calculateEventVerticalMetrics({
    startM: 6 * 60 + 55,
    endM: 7 * 60,
    windowStartMin: 6 * 60,
    windowEndMin: 11 * 60,
    hourHeight: fiveHourReferenceHeight,
    fiveHourReferenceHeight,
  });
  const atSixHours = calculateEventVerticalMetrics({
    startM: 6 * 60 + 55,
    endM: 7 * 60,
    windowStartMin: 6 * 60,
    windowEndMin: 12 * 60,
    hourHeight: 80,
    fiveHourReferenceHeight,
  });

  const lineTopAtFive = getHourLineTop(7 * 60, 6 * 60, fiveHourReferenceHeight);
  const lineTopAtSix = getHourLineTop(7 * 60, 6 * 60, 80);

  assert.equal(
    atSixHours?.top! - lineTopAtSix,
    atFiveHours?.top! - lineTopAtFive
  );
  assert.notEqual(atSixHours?.height, atFiveHours?.height);
});

test('keeps the post-hour event start anchored to its hour line', () => {
  const fiveHourReferenceHeight = 96;
  const atFiveHours = calculateEventVerticalMetrics({
    startM: 7 * 60,
    endM: 7 * 60 + 5,
    windowStartMin: 6 * 60,
    windowEndMin: 11 * 60,
    hourHeight: fiveHourReferenceHeight,
    fiveHourReferenceHeight,
  });
  const atSixHours = calculateEventVerticalMetrics({
    startM: 7 * 60,
    endM: 7 * 60 + 5,
    windowStartMin: 6 * 60,
    windowEndMin: 12 * 60,
    hourHeight: 80,
    fiveHourReferenceHeight,
  });

  const lineTopAtFive = getHourLineTop(7 * 60, 6 * 60, fiveHourReferenceHeight);
  const lineTopAtSix = getHourLineTop(7 * 60, 6 * 60, 80);

  assert.equal(atFiveHours?.top! - lineTopAtFive, 2);
  assert.equal(atSixHours?.top! - lineTopAtSix, 2);
});
