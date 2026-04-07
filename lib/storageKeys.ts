import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEYS = {
  habits: 'tothemoon_habits_v1',
  tables: 'tothemoon_tables_v1',
  tracker: 'tothemoon_tracker_v1',
  history: 'tothemoon_history_v1',
  lastReset: 'tothemoon_lastreset_v1',
  dayResetTime: 'tothemoon_dayresettime_v1',
  dayResetHistory: 'tothemoon_dayreset_history_v3',
  reviewedDates: 'tothemoon_reviewed_dates_v1',
  shopCoinsSpent: 'tothemoon_shop_coins_spent_v1',
  shopFuturisticUnlocked: 'tothemoon_shop_futuristic_unlocked_v1',
  introSeen: 'tothemoon_intro_seen_v1',
  appLocale: 'tothemoon_app_locale_v1',
} as const;

export const LEGACY_STORAGE_KEYS = {
  habits: 'habitcheck_habits_v1',
  tables: 'habitcheck_tables_v1',
  tracker: 'habitcheck_tracker_v1',
  history: 'habitcheck_history_v1',
  lastReset: 'habitcheck_lastreset_v1',
  dayResetTime: 'habitcheck_dayresettime_v1',
  dayResetHistory: 'habitcheck_dayreset_history_v3',
  dayResetHistoryV2: 'habitcheck_dayreset_history_v2',
  reviewedDates: 'habitcheck_reviewed_dates_v1',
  shopCoinsSpent: 'habitcheck_shop_coins_spent_v1',
  shopFuturisticUnlocked: 'habitcheck_shop_futuristic_unlocked_v1',
} as const;

function normalizeLegacyKeys(legacyKeys?: string | readonly string[]): readonly string[] {
  if (!legacyKeys) return [];
  return Array.isArray(legacyKeys) ? legacyKeys : [legacyKeys];
}

export async function getItemWithLegacy(
  primaryKey: string,
  legacyKeys?: string | readonly string[],
): Promise<string | null> {
  const primaryValue = await AsyncStorage.getItem(primaryKey);
  if (primaryValue != null) return primaryValue;

  for (const legacyKey of normalizeLegacyKeys(legacyKeys)) {
    const legacyValue = await AsyncStorage.getItem(legacyKey);
    if (legacyValue != null) {
      AsyncStorage.setItem(primaryKey, legacyValue).catch(() => {});
      return legacyValue;
    }
  }

  return null;
}
