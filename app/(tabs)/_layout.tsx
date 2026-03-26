import { useAppTheme } from '@/lib/theme-context';
import { Tabs } from 'expo-router';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
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
      <NativeTabs.Trigger name="index" options={{ title: 'Tasks' }}>
        <Icon sf={{ default: 'list.bullet', selected: 'list.bullet' }} />
        <Label>Tasks</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="oggi" options={{ title: 'Oggi' }}>
        <Icon sf={{ default: 'sun.max', selected: 'sun.max.fill' }} />
        <Label>Oggi</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar" options={{ title: 'Calendario' }}>
        <Icon sf={{ default: 'calendar', selected: 'calendar' }} />
        <Label>Calendario</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="shop" options={{ title: 'Shop' }}>
        <Icon sf={{ default: 'bag', selected: 'bag.fill' }} />
        <Label>Shop</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
