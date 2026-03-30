import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NoiseBackground } from '@/components/NoiseBackground';
import { HabitsProvider } from '@/lib/habits/Provider';
import { AppThemeProvider, useAppTheme } from '@/lib/theme-context';
import { BagelFatOne_400Regular, useFonts } from '@expo-google-fonts/bagel-fat-one';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import '@/lib/geofenceTask';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => { });

LogBox.ignoreLogs([
  'InteractionManager has been deprecated and will be removed in a future release.',
]);


export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigator() {
  const { activeTheme } = useAppTheme();
  const stackBackgroundColor = activeTheme === 'futuristic' ? 'transparent' : '#000';

  return (
    <ThemeProvider value={{ ...DarkTheme, colors: { ...DarkTheme.colors, background: '#000', card: '#000' } }}>
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: '#000' }} />
      <NoiseBackground />
      <Stack screenOptions={{ contentStyle: { backgroundColor: stackBackgroundColor } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BagelFatOne_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => { });
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
      <SafeAreaProvider>
        <HabitsProvider>
          <AppThemeProvider>
            <RootNavigator />
          </AppThemeProvider>
        </HabitsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
