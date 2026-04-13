import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { STORAGE_KEYS } from '@/lib/storageKeys';

export function useTaskEditorInfoHints(): boolean {
  const [showInfoHints, setShowInfoHints] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const shouldShow = (await AsyncStorage.getItem(STORAGE_KEYS.taskEditorInfoHintsSeen)) !== 'true';
      if (cancelled) return;

      setShowInfoHints(shouldShow);

      if (shouldShow) {
        AsyncStorage.setItem(STORAGE_KEYS.taskEditorInfoHintsSeen, 'true').catch(() => {});
      }
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return showInfoHints;
}
