import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';

export default function TabLayout() {
  const nativeTabContentStyle = { backgroundColor: '#000' } as const;
  const nativeTabsHostProps = {
    nativeContainerStyle: { backgroundColor: '#000' },
  } as const;

  return (
    <NativeTabs
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
