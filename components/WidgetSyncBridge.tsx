import SharedGroupPreferences from 'rn-group-preferences';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { useHabits } from '@/lib/habits/Provider';
import { buildTodayWidgetSnapshot, type WidgetCommand } from '@/lib/widgets/buildTodayWidgetSnapshot';
import {
  TODAY_WIDGET_SNAPSHOT_KEY,
  WIDGET_APP_GROUP,
  WIDGET_COMMAND_QUEUE_KEY,
  WIDGET_DEEPLINK_PREFIX,
} from '@/lib/widgets/shared';
import { reloadAllWidgetTimelines } from '@/lib/widgets/widgetCenter';

function isWidgetCommand(value: unknown): value is WidgetCommand {
  return !!value &&
    typeof value === 'object' &&
    'kind' in value &&
    'habitId' in value &&
    'logicalDate' in value &&
    (value as WidgetCommand).kind === 'toggleHabit' &&
    typeof (value as WidgetCommand).habitId === 'string' &&
    typeof (value as WidgetCommand).logicalDate === 'string';
}

async function loadQueuedWidgetCommands(): Promise<WidgetCommand[]> {
  try {
    const rawValue = await SharedGroupPreferences.getItem(
      WIDGET_COMMAND_QUEUE_KEY,
      WIDGET_APP_GROUP,
    );
    return Array.isArray(rawValue) ? rawValue.filter(isWidgetCommand) : [];
  } catch {
    return [];
  }
}

export default function WidgetSyncBridge() {
  const { habits, history, dayResetTime, getDay, isLoaded, toggleDoneForDate } = useHabits();
  const isDrainingCommandsRef = useRef(false);

  const syncTodayWidgetSnapshot = useCallback(async () => {
    if (Platform.OS !== 'ios' || !isLoaded) {
      return;
    }

    const snapshot = buildTodayWidgetSnapshot({
      habits,
      history,
      logicalDate: getDay(new Date()),
      dayResetTime,
      urlPrefix: WIDGET_DEEPLINK_PREFIX,
    });

    await SharedGroupPreferences.setItem(
      TODAY_WIDGET_SNAPSHOT_KEY,
      snapshot,
      WIDGET_APP_GROUP,
    );
    await reloadAllWidgetTimelines();
  }, [dayResetTime, getDay, habits, history, isLoaded]);

  const drainQueuedWidgetCommands = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'ios' || !isLoaded || isDrainingCommandsRef.current) {
      return false;
    }

    isDrainingCommandsRef.current = true;
    try {
      const commands = await loadQueuedWidgetCommands();
      if (commands.length === 0) {
        return false;
      }

      await SharedGroupPreferences.setItem(
        WIDGET_COMMAND_QUEUE_KEY,
        [],
        WIDGET_APP_GROUP,
      );

      for (const command of commands) {
        toggleDoneForDate(command.habitId, command.logicalDate);
      }

      return true;
    } finally {
      isDrainingCommandsRef.current = false;
    }
  }, [isLoaded, toggleDoneForDate]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !isLoaded) {
      return;
    }

    void (async () => {
      const didProcessCommands = await drainQueuedWidgetCommands();
      if (!didProcessCommands) {
        await syncTodayWidgetSnapshot();
      }
    })();
  }, [drainQueuedWidgetCommands, isLoaded, syncTodayWidgetSnapshot]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !isLoaded) {
      return;
    }

    void syncTodayWidgetSnapshot();
  }, [dayResetTime, habits, history, isLoaded, syncTodayWidgetSnapshot]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !isLoaded) {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void drainQueuedWidgetCommands();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [drainQueuedWidgetCommands, isLoaded]);

  return null;
}
