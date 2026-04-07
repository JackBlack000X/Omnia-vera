/**
 * Resolve device language without loading `expo-localization`.
 *
 * Requiring that package still hits the native `ExpoLocalization` module; when the binary was
 * built without it (old dev client, etc.), Metro can red-screen even inside try/catch. We use
 * `Intl` only — available in Hermes / RN and matches the user locale in normal iOS/Android use.
 *
 * After a fresh `npx expo run:ios` / `run:android`, you may switch this helper to prefer
 * `expo-localization` if you need extra fields (region, calendar, …).
 */
export type ExpoLocaleLike = { languageCode?: string | null };

export function getExpoLocalesSafely(): readonly ExpoLocaleLike[] {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    const languageCode = (tag.split(/[-_]/)[0] ?? 'en').toLowerCase() || 'en';
    return [{ languageCode }];
  } catch {
    return [{ languageCode: 'en' }];
  }
}
