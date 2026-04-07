import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Appearance, LogBox, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { HabitsProvider } from '@/lib/habits/Provider';
import { AppThemeProvider } from '@/lib/theme-context';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import IntroVideo from '@/components/IntroVideo';
import { BagelFatOne_400Regular, useFonts } from '@expo-google-fonts/bagel-fat-one';
import { Component, ErrorInfo, ReactNode, useCallback, useEffect, useState } from 'react';
import * as SystemUI from 'expo-system-ui';
import '@/lib/geofenceTask';

// Forza la finestra rootView a nero (impedisce i lampi bianchi)
SystemUI.setBackgroundColorAsync('#000');
// Forza React Native a simulare sempre e solo Dark Mode per componenti nativi
Appearance.setColorScheme('dark');

LogBox.ignoreLogs([
  'InteractionManager has been deprecated and will be removed in a future release.',
]);


export const unstable_settings = {
  anchor: '(tabs)',
};

type RootErrorBoundaryProps = {
  children: ReactNode;
};

type RootErrorBoundaryState = {
  error: Error | null;
};

class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Root render failed', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.errorScreen}>
          <Text style={styles.errorTitle}>Errore avvio app</Text>
          <Text style={styles.errorMessage}>{this.state.error.message || 'Errore sconosciuto'}</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

function RootNavigator() {
  return (
    <ThemeProvider value={{ ...DarkTheme, colors: { ...DarkTheme.colors, background: '#000', card: '#000' } }}>
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: '#000' }} />
      <Stack screenOptions={{ contentStyle: { backgroundColor: '#000' } }}>
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

  const [showIntro, setShowIntro] = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.introSeen).then((val) => {
      setShowIntro(val !== 'true');
    });
  }, []);

  const handleIntroDone = useCallback(() => {
    setShowIntro(false);
    AsyncStorage.setItem(STORAGE_KEYS.introSeen, 'true').catch(() => {});
  }, []);

  // Keep the app on a black boot screen until both storage and the custom font are ready.
  if (showIntro === null || !fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }

  // Show ONLY the intro video — don't mount the app tree yet
  if (showIntro) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <IntroVideo onDone={handleIntroDone} />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
      <SafeAreaProvider>
        <HabitsProvider>
          <AppThemeProvider>
            <RootErrorBoundary>
              <RootNavigator />
            </RootErrorBoundary>
          </AppThemeProvider>
        </HabitsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  errorScreen: {
    flex: 1,
    backgroundColor: '#220000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    color: '#fecaca',
    fontSize: 15,
    textAlign: 'center',
  },
});
