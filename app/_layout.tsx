import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HabitsProvider } from '@/lib/habits/Provider';
import { AppThemeProvider } from '@/lib/theme-context';
import { BagelFatOne_400Regular, useFonts } from '@expo-google-fonts/bagel-fat-one';
import { Component, ErrorInfo, ReactNode } from 'react';
import '@/lib/geofenceTask';

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
  useFonts({
    BagelFatOne_400Regular,
  });

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
