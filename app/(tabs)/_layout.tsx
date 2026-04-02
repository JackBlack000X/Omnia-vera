import { useAppTheme } from '@/lib/theme-context';
import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const { activeTheme } = useAppTheme();
  const insets = useSafeAreaInsets();

  const isFuturistic = activeTheme === 'futuristic';
  const nativeTabsKey = isFuturistic ? 'tabs-futuristic-v1' : 'tabs-native-v4';
  const nativeTabContentStyle = { backgroundColor: '#000' } as const;
  const nativeTabsHostProps = {
    nativeContainerStyle: { backgroundColor: '#000' },
  } as const;

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
      key={nativeTabsKey}
      {...nativeTabsHostProps}
      backgroundColor="#000"
      blurEffect="systemChromeMaterialDark"
      disableTransparentOnScrollEdge
      shadowColor="transparent"
      tintColor="#3b82f6"
      iconColor={{ default: '#e5e7eb', selected: '#3b82f6' }}
    >
      <NativeTabs.Trigger name="index" contentStyle={nativeTabContentStyle}>
        <NativeTabs.Trigger.Icon sf={{ default: 'list.bullet', selected: 'list.bullet' }} />
        <NativeTabs.Trigger.Label>Attivita</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="oggi"
        contentStyle={nativeTabContentStyle}
      >
        <NativeTabs.Trigger.Icon sf={{ default: 'sun.max', selected: 'sun.max.fill' }} />
        <NativeTabs.Trigger.Label>Oggi</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar" contentStyle={nativeTabContentStyle}>
        <NativeTabs.Trigger.Icon sf={{ default: 'calendar', selected: 'calendar' }} />
        <NativeTabs.Trigger.Label>Calendario</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="shop" contentStyle={nativeTabContentStyle}>
        <NativeTabs.Trigger.Icon sf={{ default: 'bag', selected: 'bag.fill' }} />
        <NativeTabs.Trigger.Label>Negozio</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
