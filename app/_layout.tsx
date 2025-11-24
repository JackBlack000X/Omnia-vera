import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, StyleSheet } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { HabitsProvider } from '@/lib/habits/Provider';
import { AppThemeProvider } from '@/lib/theme-context';
import { NoiseBackground } from '@/components/NoiseBackground';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
      <SafeAreaProvider>
        <HabitsProvider>
          <AppThemeProvider>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: '#000' }} />
              <NoiseBackground />
              <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="profile" options={{ headerShown: false, presentation: 'card' }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: false }} />
              </Stack>
              <StatusBar style="light" />
            </ThemeProvider>
          </AppThemeProvider>
        </HabitsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
