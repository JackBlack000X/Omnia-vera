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
  visibleHours?: number;
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
  const endsAt55 = endM % 60 === 55;
  const endsAt50 = endM % 60 === 50;
  const endsAt45 = endM % 60 === 45;
  const is50to55Shift = visibleHours >= 11 && endsAt55;
  const is45to50Shift = visibleHours >= 16 && endsAt50;
  const is40to45Shift = visibleHours >= 21 && endsAt45;
  const bottomExtendMin =
    is50to55Shift ? 5 :
    is45to50Shift ? 10 :
    is40to45Shift ? 15 :
    0;
  const effectiveEndM = endM + bottomExtendMin;

  const is50to55ShiftShort = is50to55Shift && !startsOnHour && fullDurationMin <= SHORT_PRE_HOUR_EVENT_MAX_MINUTES;
  const is45to50ShiftShort = is45to50Shift && !startsOnHour && fullDurationMin <= SHORT_PRE_HOUR_EVENT_MAX_MINUTES;
  const is40to45ShiftShort = is40to45Shift && !startsOnHour && fullDurationMin <= SHORT_PRE_HOUR_EVENT_MAX_MINUTES;
  const isShortPreHourEvent =
    (endsOnHour || is50to55ShiftShort || is45to50ShiftShort || is40to45ShiftShort) &&
    !startsOnHour &&
    fullDurationMin <= SHORT_PRE_HOUR_EVENT_MAX_MINUTES;

  let top = baseTop;
  if (isShortPreHourEvent) {
    const anchorEnd = Math.min(effectiveEndM, windowEndMin);
    const endAnchoredTop = ((anchorEnd - windowStartMin) / 60) * hourHeight;
    const referenceDurationHeight =
      (visibleDurationMin / 60) * fiveHourReferenceHeight;
    top = endAnchoredTop - referenceDurationHeight;
  }

  const endsOnHourEffective = endsOnHour || is50to55Shift || is45to50Shift || is40to45Shift;
  const extraHeight = bottomExtendMin > 0 ? (bottomExtendMin / 60) * hourHeight : 0;

  return {
    top: top + EVENT_TOP_OFFSET,
    height: Math.max(
      1,
      baseHeight + extraHeight - (endsOnHourEffective ? ENDS_ON_HOUR_HEIGHT_BUFFER : DEFAULT_HEIGHT_BUFFER)
    ),
  };
}
