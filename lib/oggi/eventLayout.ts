const EVENT_TOP_OFFSET = 2;
const DEFAULT_HEIGHT_BUFFER = 4;
const ENDS_ON_HOUR_HEIGHT_BUFFER = 3.75;
const SHORT_PRE_HOUR_EVENT_MAX_MINUTES = 15;
const QUARTER_HOUR_END_BOOSTS: Record<number, number> = {
  15: 0.35,
  30: 0.55,
  45: 1.05,
  50: 1.45,
  55: 1.9,
};

type EventVerticalMetricsInput = {
  startM: number;
  endM: number;
  windowStartMin: number;
  windowEndMin: number;
  hourHeight: number;
  fiveHourReferenceHeight: number;
  visibleHours?: number;
};

type EventVerticalMetrics = {
  top: number;
  height: number;
};

function getEndMinuteVisualBoost(
  minuteOfHour: number,
  hourHeight: number,
  fiveHourReferenceHeight: number,
  visibleHours: number
) {
  const baseBoost = QUARTER_HOUR_END_BOOSTS[minuteOfHour] ?? 0;
  if (!baseBoost) return 0;

  // Keep the emphasis readable even when many hours are visible,
  // without letting the boost dominate at tighter zoom levels.
  const hourScale = Math.max(0.8, Math.min(1.05, hourHeight / fiveHourReferenceHeight));
  const densityScale = visibleHours >= 20 ? 1.08 : visibleHours >= 14 ? 1 : 0.92;
  const zoomScale = hourScale * densityScale;
  return baseBoost * zoomScale;
}

export function calculateEventVerticalMetrics({
  startM,
  endM,
  windowStartMin,
  windowEndMin,
  hourHeight,
  fiveHourReferenceHeight,
  visibleHours = 10,
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
  const endMinuteOfHour = ((endM % 60) + 60) % 60;
  const endVisualBoost = getEndMinuteVisualBoost(
    endMinuteOfHour,
    hourHeight,
    fiveHourReferenceHeight,
    visibleHours
  );

  const isShortPreHourEvent =
    (endsOnHour || endVisualBoost > 0) &&
    !startsOnHour &&
    fullDurationMin <= SHORT_PRE_HOUR_EVENT_MAX_MINUTES;

  let top = baseTop;
  if (isShortPreHourEvent) {
    const endAnchoredTop = ((visibleEnd - windowStartMin) / 60) * hourHeight + endVisualBoost;
    const referenceDurationHeight =
      (visibleDurationMin / 60) * fiveHourReferenceHeight;
    top = endAnchoredTop - referenceDurationHeight;
  }

  return {
    top: top + EVENT_TOP_OFFSET,
    height: Math.max(
      1,
      baseHeight + endVisualBoost - (endsOnHour ? ENDS_ON_HOUR_HEIGHT_BUFFER : DEFAULT_HEIGHT_BUFFER)
    ),
  };
}
