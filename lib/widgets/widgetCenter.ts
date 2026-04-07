import { NativeModules, Platform } from 'react-native';

type WidgetCenterBridgeModule = {
  reloadAllTimelines?: () => Promise<void>;
};

const widgetCenterBridge = NativeModules.WidgetCenterBridge as WidgetCenterBridgeModule | undefined;

export async function reloadAllWidgetTimelines(): Promise<void> {
  if (Platform.OS !== 'ios') {
    return;
  }

  await widgetCenterBridge?.reloadAllTimelines?.();
}
