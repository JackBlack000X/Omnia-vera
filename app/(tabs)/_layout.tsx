import { useAppTheme } from '@/lib/theme-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const { activeTheme } = useAppTheme();
  const insets = useSafeAreaInsets();

  const isFuturistic = activeTheme === 'futuristic';

  if (isFuturistic) {
    return (
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: 'transparent' },
          tabBarActiveTintColor: '#ffffff',
          tabBarInactiveTintColor: '#666666',
          tabBarStyle: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 50 + insets.top,
            backgroundColor: 'transparent',
            borderBottomWidth: 0,
            borderTopWidth: 0,
            elevation: 0,
            paddingTop: insets.top,
            paddingBottom: 0,
          },
          tabBarBackground: () => (
            <View style={{ flex: 1, backgroundColor: '#000000' }} />
          ),
          tabBarItemStyle: {
            justifyContent: 'center',
            paddingVertical: 0,
          },
          tabBarLabelStyle: {
            fontSize: 14,
            fontWeight: '600',
            letterSpacing: 1,
            textTransform: 'uppercase',
          },
          tabBarIconStyle: { display: 'none' },
          tabBarLabelPosition: 'beside-icon',
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'TASKS', tabBarLabel: 'TASKS', tabBarIcon: () => null }} />
        <Tabs.Screen name="oggi" options={{ title: 'OGGI', tabBarLabel: 'OGGI', tabBarIcon: () => null }} />
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'CALENDARIO',
            tabBarLabel: 'CAL',
            tabBarIcon: () => null,
            tabBarItemStyle: { justifyContent: 'center', paddingVertical: 0 },
          }}
        />
        <Tabs.Screen
          name="shop"
          options={{
            title: 'SHOP',
            tabBarLabel: 'SHOP',
            tabBarIcon: () => null,
            tabBarItemStyle: { justifyContent: 'center', paddingVertical: 0 },
          }}
        />
      </Tabs>
    );
  }

  return (
    <NativeTabs
      tintColor="#3b82f6"
      iconColor={{ default: '#e5e7eb', selected: '#3b82f6' }}
    >
      <NativeTabs.Trigger name="index" contentStyle={{ backgroundColor: '#000' }} unstable_nativeProps={{ backgroundColor: '#000' }}>
        <Icon sf="list.bullet" />
        <Label>Tasks</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="oggi" contentStyle={{ backgroundColor: '#000' }} unstable_nativeProps={{ backgroundColor: '#000' }}>
        <Icon sf="sun.max" />
        <Label>Oggi</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar" contentStyle={{ backgroundColor: '#000' }} unstable_nativeProps={{ backgroundColor: '#000' }}>
        <Icon sf="calendar" />
        <Label>Calendario</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="shop" contentStyle={{ backgroundColor: '#000' }} unstable_nativeProps={{ backgroundColor: '#000' }}>
        <Icon sf="bag" />
        <Label>Shop</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
