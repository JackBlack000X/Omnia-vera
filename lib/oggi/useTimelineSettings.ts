import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export function useTimelineSettings() {
  const [windowStart, setWindowStart] = useState<string>('06:00');
  const [windowEnd, setWindowEnd] = useState<string>('22:00');
  const [visibleHours, setVisibleHours] = useState<number>(10);
  const [dragMode, setDragMode] = useState<'forward' | 'single'>('forward');

  useEffect(() => {
    (async () => {
      try {
        const [start, end, visible, mode] = await Promise.all([
          AsyncStorage.getItem('oggi_window_start_v1'),
          AsyncStorage.getItem('oggi_window_end_v1'),
          AsyncStorage.getItem('oggi_visible_hours_v1'),
          AsyncStorage.getItem('oggi_drag_mode_v1'),
        ]);
        if (start) setWindowStart(start);
        if (end) setWindowEnd(end);
        if (visible) {
          const v = parseInt(visible, 10);
          if (!isNaN(v) && v >= 5 && v <= 24) setVisibleHours(v);
        }
        if (mode === 'single' || mode === 'forward') setDragMode(mode);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('oggi_window_start_v1', windowStart).catch(() => {});
  }, [windowStart]);

  useEffect(() => {
    AsyncStorage.setItem('oggi_window_end_v1', windowEnd).catch(() => {});
  }, [windowEnd]);

  useEffect(() => {
    AsyncStorage.setItem('oggi_visible_hours_v1', visibleHours.toString()).catch(() => {});
  }, [visibleHours]);

  useEffect(() => {
    AsyncStorage.setItem('oggi_drag_mode_v1', dragMode).catch(() => {});
  }, [dragMode]);

  return {
    windowStart,
    setWindowStart,
    windowEnd,
    setWindowEnd,
    visibleHours,
    setVisibleHours,
    dragMode,
    setDragMode,
  };
}
