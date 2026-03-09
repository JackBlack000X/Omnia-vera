const EVENT_TOP_OFFSET = 2;
const DEFAULT_HEIGHT_BUFFER = 4;
const ENDS_ON_HOUR_HEIGHT_BUFFER = 3.75;
const SHORT_PRE_HOUR_EVENT_MAX_MINUTES = 15;

type EventVerticalMetricsInput = {
  startM: number;
  endM: number;
  windowStartMin: number;
  windowEndMin: number;
  hourHeight: number;
  fiveHourReferenceHeight: number;
};

type EventVerticalMetrics = {
  top: number;
  height: number;
};

export function calculateEventVerticalMetrics({
  startM,
  endM,
  windowStartMin,
  windowEndMin,
  hourHeight,
  fiveHourReferenceHeight,
}: EventVerticalMetricsInput): EventVerticalMetrics | null {
  if (endM <= windowStartMin || startM >= windowEndMin) return null;

  const visibleStart = Math.max(startM, windowStartMin);
  const visibleEnd = Math.min(endM, windowEndMin);
  const visibleDurationMin = visibleEnd - visibleStart;
  const fullDurationMin = endM - startM;

  const baseTop = ((visibleStart - windowStartMin) / 60) * hourHeight;
  const baseHeight = Math.max(1, (visibleDurationMin / 60) * hourHeight);
  const endsOnHour = endM % 60 === 0;
  const startsOnHour = startM % 60 === 0;
  const isShortPreHourEvent =
    endsOnHour &&
    !startsOnHour &&
    fullDurationMin <= SHORT_PRE_HOUR_EVENT_MAX_MINUTES;

  let top = baseTop;
  if (isShortPreHourEvent) {
    const endAnchoredTop = ((visibleEnd - windowStartMin) / 60) * hourHeight;
    const referenceDurationHeight =
      (visibleDurationMin / 60) * fiveHourReferenceHeight;
    top = endAnchoredTop - referenceDurationHeight;
  }

  return {
    top: top + EVENT_TOP_OFFSET,
    height: Math.max(
      1,
      baseHeight - (endsOnHour ? ENDS_ON_HOUR_HEIGHT_BUFFER : DEFAULT_HEIGHT_BUFFER)
    ),
  };
}
