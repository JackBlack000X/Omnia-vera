import { createStableId } from '@/lib/createStableId';
import { useAppDateBounds } from '@/lib/appDateBounds';
import { clampYmdNotBeforeYmd, formatYmd, ymdToDate } from '@/lib/date';
import { useHabits } from '@/lib/habits/Provider';
import type {
  Habit,
  TableColumnSeries,
  TableSeriesIntervalUnit,
  UserTable,
} from '@/lib/habits/schema';
import { useFormatLocale } from '@/lib/i18n/useFormatLocale';
import { BlurView } from 'expo-blur';
import { GlassContainer, GlassView } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const GLASS_EFFECT = { style: 'regular', animate: true, animationDuration: 0.26 } as const;
const DEFAULT_START_MINUTES = 8 * 60;
const DEFAULT_END_MINUTES = 9 * 60;

type TableColumnSeriesModalProps = {
  visible: boolean;
  table: UserTable;
  columnIndex: number;
  columnLabel: string;
  rowCount: number;
  onClose: () => void;
  onTablePatch: (patch: Partial<Omit<UserTable, 'id' | 'createdAt'>>) => void;
};

function minutesToDate(value: number): Date {
  const next = new Date();
  next.setHours(Math.floor(value / 60), value % 60, 0, 0);
  return next;
}

function minutesToHhmm(value: number): string {
  const hours = String(Math.floor(value / 60)).padStart(2, '0');
  const minutes = String(value % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function hhmmToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function clampTimedRange(startMin: number, endMin: number): { start: number; end: number } {
  const clampedStart = Math.max(0, Math.min(23 * 60 + 55, Math.round(startMin / 5) * 5));
  const clampedEnd = Math.max(clampedStart + 5, Math.min(24 * 60, Math.round(endMin / 5) * 5));
  return { start: clampedStart, end: clampedEnd };
}

function addIntervalToYmd(ymd: string, amount: number, unit: TableSeriesIntervalUnit): string {
  const next = ymdToDate(ymd);
  if (unit === 'days') {
    next.setDate(next.getDate() + amount);
  } else if (unit === 'weeks') {
    next.setDate(next.getDate() + amount * 7);
  } else {
    next.setMonth(next.getMonth() + amount);
  }
  return formatYmd(next);
}

function buildTaskTitle(tableName: string, columnLabel: string, rowNumber: number, colNumber: number): string {
  const safeTable = tableName.trim();
  const safeColumn = columnLabel.trim() || `C${colNumber}`;
  return [safeTable, safeColumn, String(rowNumber)].filter(Boolean).join(' ');
}

function buildSingleTaskSchedule(startTime: string | null, endTime: string | null): NonNullable<Habit['schedule']> {
  return {
    daysOfWeek: [],
    monthDays: undefined,
    time: startTime,
    endTime,
    yearMonth: undefined,
    yearDay: undefined,
    weeklyTimes: undefined,
    monthlyTimes: undefined,
    weeklyOccurrences: undefined,
    monthlyOccurrences: undefined,
    weeklyGaps: undefined,
    monthlyGaps: undefined,
    repeatEndDate: undefined,
    repeatStartDate: undefined,
  };
}

function buildSingleTaskOverride(
  ymd: string,
  hasTime: boolean,
  start: string | null,
  end: string | null,
): Habit['timeOverrides'] {
  if (!hasTime) {
    return { [ymd]: '00:00' };
  }
  if (!start || !end) {
    return undefined;
  }
  return {
    [ymd]: {
      start,
      end,
    },
  };
}

function FieldButton({
  icon,
  title,
  value,
  expanded,
  accent,
  onPress,
  last = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  value: string;
  expanded: boolean;
  accent: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      <View style={[styles.fieldRow, !last && styles.rowDivider]}>
        <View style={[styles.fieldBubble, { backgroundColor: `${accent}22`, borderColor: `${accent}55` }]}>
          <Ionicons name={icon} size={16} color={accent} />
        </View>
        <View style={styles.fieldCopy}>
          <Text style={styles.fieldTitle}>{title}</Text>
          <Text style={styles.fieldValue}>{value}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={18}
          color="rgba(255,255,255,0.54)"
        />
      </View>
    </Pressable>
  );
}

function ChoicePill({
  label,
  selected,
  onPress,
  style,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [style, pressed && styles.pressed]}>
      <GlassView
        glassEffectStyle={selected ? GLASS_EFFECT : 'clear'}
        colorScheme="dark"
        isInteractive
        style={[styles.choicePill, selected ? styles.choicePillActive : styles.choicePillIdle]}
      >
        <Text style={[styles.choicePillText, selected && styles.choicePillTextActive]}>{label}</Text>
      </GlassView>
    </Pressable>
  );
}

export function TableColumnSeriesModal({
  visible,
  table,
  columnIndex,
  columnLabel,
  rowCount,
  onClose,
  onTablePatch,
}: TableColumnSeriesModalProps) {
  const { t } = useTranslation();
  const locale = useFormatLocale();
  const { setHabits, habits } = useHabits();
  const { installMonthStartYmd: minSelectableYmd } = useAppDateBounds();

  const existingSeries = table.columnSeries?.[columnIndex] as TableColumnSeries | undefined;
  const linkedHabits = useMemo(
    () =>
      habits.filter(
        (habit) =>
          habit.tableSeriesLink?.tableId === table.id &&
          habit.tableSeriesLink.columnIndex === columnIndex &&
          habit.tableSeriesLink.source !== 'cell',
      ),
    [columnIndex, habits, table.id],
  );

  const [selectedYmd, setSelectedYmd] = useState(() => clampYmdNotBeforeYmd(formatYmd(new Date()), minSelectableYmd));
  const [hasTime, setHasTime] = useState(true);
  const [startMin, setStartMin] = useState(DEFAULT_START_MINUTES);
  const [endMin, setEndMin] = useState(DEFAULT_END_MINUTES);
  const [intervalValue, setIntervalValue] = useState(1);
  const [intervalUnit, setIntervalUnit] = useState<TableSeriesIntervalUnit>('weeks');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  useEffect(() => {
    if (!visible) return;

    const nextSeries = existingSeries;
    const fallbackStart = clampYmdNotBeforeYmd(formatYmd(new Date()), minSelectableYmd);
    const safeStart = clampYmdNotBeforeYmd(nextSeries?.startDate ?? fallbackStart, minSelectableYmd);
    const startFromSeries = hhmmToMinutes(nextSeries?.startTime) ?? DEFAULT_START_MINUTES;
    const endFromSeries = hhmmToMinutes(nextSeries?.endTime) ?? DEFAULT_END_MINUTES;

    setSelectedYmd(safeStart);
    setHasTime(nextSeries?.hasTime ?? true);
    setStartMin(startFromSeries);
    setEndMin(endFromSeries > startFromSeries ? endFromSeries : startFromSeries + 60);
    setIntervalValue(Math.max(1, Math.floor(nextSeries?.intervalValue ?? 1)));
    setIntervalUnit(nextSeries?.intervalUnit ?? 'weeks');
    setShowDatePicker(false);
    setShowStartPicker(false);
    setShowEndPicker(false);
  }, [existingSeries, minSelectableYmd, visible]);

  useEffect(() => {
    if (endMin <= startMin) {
      setEndMin(Math.min(24 * 60, startMin + 60));
    }
  }, [endMin, startMin]);

  const normalizedRange = useMemo(() => clampTimedRange(startMin, endMin), [endMin, startMin]);
  const startLabel = useMemo(
    () =>
      minutesToDate(normalizedRange.start).toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale, normalizedRange.start],
  );
  const endLabel = useMemo(
    () =>
      minutesToDate(normalizedRange.end).toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale, normalizedRange.end],
  );
  const dateLabel = useMemo(
    () =>
      ymdToDate(selectedYmd).toLocaleDateString(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [locale, selectedYmd],
  );
  const resolvedColumnLabel = useMemo(
    () => columnLabel.trim() || t('tablesUi.columnSeriesColumnFallback', { n: columnIndex + 1 }),
    [columnIndex, columnLabel, t],
  );

  const previewDates = useMemo(() => {
    const previews = Array.from({ length: Math.min(rowCount, 3) }, (_, index) => {
      const targetYmd = addIntervalToYmd(selectedYmd, index * intervalValue, intervalUnit);
      return {
        rowNumber: index + 1,
        ymd: targetYmd,
      };
    });
    const lastYmd =
      rowCount > 0 ? addIntervalToYmd(selectedYmd, (rowCount - 1) * intervalValue, intervalUnit) : selectedYmd;
    return { previews, lastYmd };
  }, [intervalUnit, intervalValue, rowCount, selectedYmd]);

  const intervalLabel = useMemo(() => {
    if (intervalUnit === 'days') {
      return intervalValue === 1
        ? t('tablesUi.columnSeriesIntervalDayOne')
        : t('tablesUi.columnSeriesIntervalDayMany');
    }
    if (intervalUnit === 'weeks') {
      return intervalValue === 1
        ? t('tablesUi.columnSeriesIntervalWeekOne')
        : t('tablesUi.columnSeriesIntervalWeekMany');
    }
    return intervalValue === 1
      ? t('tablesUi.columnSeriesIntervalMonthOne')
      : t('tablesUi.columnSeriesIntervalMonthMany');
  }, [intervalUnit, intervalValue, t]);

  const handleSave = useCallback(() => {
    const safeStartYmd = clampYmdNotBeforeYmd(selectedYmd, minSelectableYmd);
    const safeRange = clampTimedRange(startMin, endMin);
    const startTime = hasTime ? minutesToHhmm(safeRange.start) : null;
    const endTime = hasTime ? minutesToHhmm(safeRange.end) : null;
    const seriesId = existingSeries?.seriesId ?? createStableId();
    const nowYmd = formatYmd(new Date());
    const trimmedFolder = table.folder?.trim() || undefined;

    setHabits((prev) => {
      const next = [...prev];
      const linkedIndexByRow = new Map<number, number>();

      prev.forEach((habit, index) => {
        if (
          habit.tableSeriesLink?.tableId === table.id &&
          habit.tableSeriesLink.columnIndex === columnIndex &&
          habit.tableSeriesLink.source !== 'cell'
        ) {
          linkedIndexByRow.set(habit.tableSeriesLink.rowIndex, index);
        }
      });

      for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        const taskYmd = addIntervalToYmd(safeStartYmd, rowIndex * intervalValue, intervalUnit);
        const taskTitle = buildTaskTitle(table.name, columnLabel, rowIndex + 1, columnIndex + 1);
        const timeOverrides = buildSingleTaskOverride(taskYmd, hasTime, startTime, endTime);
        const schedule = buildSingleTaskSchedule(startTime, endTime);
        const taskPatch: Partial<Habit> = {
          text: taskTitle,
          color: table.color,
          folder: trimmedFolder,
          tipo: 'task',
          isAllDay: !hasTime,
          habitFreq: 'single',
          schedule,
          timeOverrides,
          tableSeriesLink: {
            tableId: table.id,
            columnIndex,
            rowIndex,
            seriesId,
            source: 'columnSeries',
          },
        };
        const existingIndex = linkedIndexByRow.get(rowIndex);

        if (existingIndex !== undefined) {
          next[existingIndex] = {
            ...next[existingIndex],
            ...taskPatch,
          };
          continue;
        }

        next.push({
          id: createStableId(),
          text: taskTitle,
          order: next.length,
          color: table.color,
          createdAt: nowYmd,
          createdAtMs: Date.now() + rowIndex,
          folder: trimmedFolder,
          tipo: 'task',
          isAllDay: !hasTime,
          habitFreq: 'single',
          schedule,
          timeOverrides,
          tableSeriesLink: {
            tableId: table.id,
            columnIndex,
            rowIndex,
            seriesId,
            source: 'columnSeries',
          },
        });
      }

      return next;
    });

    onTablePatch({
      columnSeries: {
        ...(table.columnSeries ?? {}),
        [columnIndex]: {
          seriesId,
          startDate: safeStartYmd,
          hasTime,
          startTime,
          endTime,
          intervalValue,
          intervalUnit,
        },
      },
    });
    onClose();
  }, [
    columnIndex,
    columnLabel,
    endMin,
    existingSeries?.seriesId,
    hasTime,
    intervalUnit,
    intervalValue,
    minSelectableYmd,
    onClose,
    onTablePatch,
    rowCount,
    selectedYmd,
    setHabits,
    startMin,
    table.color,
    table.columnSeries,
    table.folder,
    table.id,
    table.name,
  ]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlayRoot}>
        <LinearGradient
          colors={['rgba(0,0,0,0.18)', 'rgba(3,7,18,0.6)', 'rgba(0,0,0,0.82)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardRoot}
        >
          <SafeAreaView edges={['bottom']} style={styles.sheetSafe}>
            <GlassView
              glassEffectStyle={GLASS_EFFECT}
              colorScheme="dark"
              isInteractive
              style={styles.sheetSurface}
            >
              <BlurView intensity={68} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFillObject} />
              <LinearGradient
                colors={[
                  'rgba(255,255,255,0.22)',
                  'rgba(255,255,255,0.08)',
                  'rgba(15,23,42,0.54)',
                ]}
                start={{ x: 0.08, y: 0 }}
                end={{ x: 0.92, y: 1 }}
                style={styles.sheetGlow}
              />

              <View style={styles.handleSlot}>
                <View style={styles.handle} />
              </View>

              <View style={styles.header}>
                <TouchableOpacity onPress={onClose}>
                  <Text style={styles.headerSide}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('tablesUi.columnSeriesTitle')}</Text>
                <TouchableOpacity onPress={handleSave}>
                  <Text style={[styles.headerSide, styles.headerAction]}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.scrollContent}
              >
                <GlassView
                  glassEffectStyle={GLASS_EFFECT}
                  colorScheme="dark"
                  isInteractive
                  style={styles.heroCard}
                >
                  <Text style={styles.heroTitle} numberOfLines={2}>
                    {table.name}
                  </Text>
                  <Text style={styles.heroSubtitle} numberOfLines={2}>
                    {t('tablesUi.columnSeriesRowsFromFirst', {
                      column: resolvedColumnLabel,
                      count: rowCount,
                    })}
                  </Text>
                  {linkedHabits.length > 0 ? (
                    <Text style={styles.heroHint}>
                      {t('tablesUi.columnSeriesExistingHint', {
                        count: Math.min(linkedHabits.length, rowCount),
                      })}
                    </Text>
                  ) : (
                    <Text style={styles.heroHint}>
                      {t('tablesUi.columnSeriesNewHint')}
                    </Text>
                  )}
                </GlassView>

                <GlassView
                  glassEffectStyle={GLASS_EFFECT}
                  colorScheme="dark"
                  isInteractive
                  style={styles.sectionCard}
                >
                  <FieldButton
                    icon="calendar-outline"
                    title={t('tablesUi.columnSeriesFirstRowStart')}
                    value={dateLabel}
                    expanded={showDatePicker}
                    accent="#93C5FD"
                    onPress={() => {
                      setShowDatePicker((current) => !current);
                      setShowStartPicker(false);
                      setShowEndPicker(false);
                    }}
                  />
                  {showDatePicker ? (
                    <DateTimePicker
                      value={ymdToDate(selectedYmd)}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'inline' : 'default'}
                      themeVariant="dark"
                      textColor="white"
                      minimumDate={ymdToDate(minSelectableYmd)}
                      accentColor="#93C5FD"
                      onChange={(_, date) => {
                        if (!date) return;
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        setSelectedYmd(clampYmdNotBeforeYmd(`${year}-${month}-${day}`, minSelectableYmd));
                      }}
                    />
                  ) : null}

                  <View style={styles.inlineSection}>
                    <Text style={styles.inlineSectionTitle}>{t('modal.timeLabel')}</Text>
                    <GlassContainer spacing={10} style={styles.choiceRow}>
                      <ChoicePill
                        label={t('modal.allDay')}
                        selected={!hasTime}
                        onPress={() => {
                          setHasTime(false);
                          setShowStartPicker(false);
                          setShowEndPicker(false);
                        }}
                        style={styles.flexChoice}
                      />
                      <ChoicePill
                        label={t('modal.specificTime')}
                        selected={hasTime}
                        onPress={() => setHasTime(true)}
                        style={styles.flexChoice}
                      />
                    </GlassContainer>
                  </View>

                  {hasTime ? (
                    <>
                      <FieldButton
                        icon="time-outline"
                        title={t('modal.timeStart')}
                        value={startLabel}
                        expanded={showStartPicker}
                        accent="#6EE7B7"
                        onPress={() => {
                          setShowStartPicker((current) => !current);
                          setShowDatePicker(false);
                          setShowEndPicker(false);
                        }}
                      />
                      {showStartPicker ? (
                        <DateTimePicker
                          value={minutesToDate(normalizedRange.start)}
                          mode="time"
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          themeVariant="dark"
                          textColor="white"
                          onChange={(_, date) => {
                            if (!date) return;
                            setStartMin(date.getHours() * 60 + date.getMinutes());
                          }}
                        />
                      ) : null}

                      <FieldButton
                        icon="flag-outline"
                        title={t('modal.timeEnd')}
                        value={endLabel}
                        expanded={showEndPicker}
                        accent="#F9A8D4"
                        onPress={() => {
                          setShowEndPicker((current) => !current);
                          setShowDatePicker(false);
                          setShowStartPicker(false);
                        }}
                        last
                      />
                      {showEndPicker ? (
                        <DateTimePicker
                          value={minutesToDate(normalizedRange.end)}
                          mode="time"
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          themeVariant="dark"
                          textColor="white"
                          onChange={(_, date) => {
                            if (!date) return;
                            setEndMin(date.getHours() * 60 + date.getMinutes());
                          }}
                        />
                      ) : null}
                    </>
                  ) : null}
                </GlassView>

                <GlassView
                  glassEffectStyle={GLASS_EFFECT}
                  colorScheme="dark"
                  isInteractive
                  style={styles.sectionCard}
                >
                  <Text style={styles.sectionTitle}>{t('tablesUi.columnSeriesGapBetweenRows')}</Text>
                  <View style={styles.stepperRow}>
                    <TouchableOpacity
                      style={styles.stepButton}
                      onPress={() => setIntervalValue((current) => Math.max(1, current - 1))}
                    >
                      <Text style={styles.stepButtonText}>−</Text>
                    </TouchableOpacity>
                    <View style={styles.stepValueWrap}>
                      <Text style={styles.stepValue}>{intervalValue}</Text>
                      <Text style={styles.stepValueHint}>{intervalLabel}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.stepButton}
                      onPress={() => setIntervalValue((current) => Math.min(365, current + 1))}
                    >
                      <Text style={styles.stepButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>

                  <GlassContainer spacing={10} style={styles.choiceRow}>
                    <ChoicePill
                      label={t('tablesUi.columnSeriesIntervalDayMany')}
                      selected={intervalUnit === 'days'}
                      onPress={() => setIntervalUnit('days')}
                      style={styles.flexChoice}
                    />
                    <ChoicePill
                      label={t('tablesUi.columnSeriesIntervalWeekMany')}
                      selected={intervalUnit === 'weeks'}
                      onPress={() => setIntervalUnit('weeks')}
                      style={styles.flexChoice}
                    />
                    <ChoicePill
                      label={t('tablesUi.columnSeriesIntervalMonthMany')}
                      selected={intervalUnit === 'months'}
                      onPress={() => setIntervalUnit('months')}
                      style={styles.flexChoice}
                    />
                  </GlassContainer>
                </GlassView>

                <GlassView
                  glassEffectStyle={GLASS_EFFECT}
                  colorScheme="dark"
                  isInteractive
                  style={styles.sectionCard}
                >
                  <Text style={styles.sectionTitle}>{t('tablesUi.columnSeriesPreview')}</Text>
                  {previewDates.previews.map((item) => (
                    <View key={item.rowNumber} style={styles.previewRow}>
                      <Text style={styles.previewIndex}>{item.rowNumber}</Text>
                      <Text style={styles.previewText}>
                        {ymdToDate(item.ymd).toLocaleDateString(locale, {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                        {hasTime ? ` · ${startLabel}` : ''}
                      </Text>
                    </View>
                  ))}
                  {rowCount > 3 ? (
                    <Text style={styles.previewTail}>
                      {t('tablesUi.columnSeriesLastRow', {
                        date: ymdToDate(previewDates.lastYmd).toLocaleDateString(locale, {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        }),
                        time: hasTime ? ` · ${startLabel}` : '',
                      })}
                    </Text>
                  ) : null}
                </GlassView>
              </ScrollView>
            </GlassView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  keyboardRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetSafe: {
    justifyContent: 'flex-end',
  },
  sheetSurface: {
    overflow: 'hidden',
    backgroundColor: '#07080B',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 8,
    maxHeight: '88%',
  },
  sheetGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  handleSlot: {
    alignItems: 'center',
    paddingBottom: 6,
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  headerSide: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
  headerAction: {
    color: '#7DD3FC',
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 26,
    gap: 14,
  },
  heroCard: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.54)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '800',
    marginTop: 6,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 15,
    marginTop: 4,
  },
  heroHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginTop: 10,
    lineHeight: 18,
  },
  sectionCard: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  fieldBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldCopy: {
    flex: 1,
    marginLeft: 12,
  },
  fieldTitle: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 12,
    fontWeight: '700',
  },
  fieldValue: {
    color: '#FFFFFF',
    fontSize: 15,
    marginTop: 2,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  inlineSection: {
    paddingTop: 12,
    paddingBottom: 2,
  },
  inlineSectionTitle: {
    color: 'rgba(255,255,255,0.56)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  choiceRow: {
    width: '100%',
  },
  flexChoice: {
    flex: 1,
  },
  choicePill: {
    minHeight: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  choicePillIdle: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  choicePillActive: {
    backgroundColor: 'rgba(125,211,252,0.18)',
  },
  choicePillText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    fontWeight: '600',
  },
  choicePillTextActive: {
    color: '#FFFFFF',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
  },
  stepButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  stepButtonText: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '500',
  },
  stepValueWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  stepValueHint: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 13,
    marginTop: 2,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 7,
  },
  previewIndex: {
    width: 24,
    color: '#7DD3FC',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  previewText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },
  previewTail: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 13,
    marginTop: 8,
  },
  pressed: {
    opacity: 0.85,
  },
});
