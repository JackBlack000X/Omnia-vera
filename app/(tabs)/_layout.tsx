import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { useTranslation } from 'react-i18next';

export default function TabLayout() {
  const { t } = useTranslation();
  const nativeTabContentStyle = { backgroundColor: '#000' } as const;
  const nativeTabsHostProps = {
    nativeContainerStyle: { backgroundColor: 'transparent' },
  } as const;

  return (
    <NativeTabs
      {...nativeTabsHostProps}
      backgroundColor="transparent"
      blurEffect="systemChromeMaterialDark"
      disableTransparentOnScrollEdge
      shadowColor="transparent"
      tintColor="#3b82f6"
      iconColor={{ default: '#e5e7eb', selected: '#3b82f6' }}
    >
      <NativeTabs.Trigger name="index" contentStyle={nativeTabContentStyle}>
        <NativeTabs.Trigger.Icon sf={{ default: 'list.bullet', selected: 'list.bullet' }} />
        <NativeTabs.Trigger.Label>{t('tabs.activities')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="oggi"
        contentStyle={nativeTabContentStyle}
      >
        <NativeTabs.Trigger.Icon sf={{ default: 'sun.max', selected: 'sun.max.fill' }} />
        <NativeTabs.Trigger.Label>{t('tabs.today')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar" contentStyle={nativeTabContentStyle}>
        <NativeTabs.Trigger.Icon sf={{ default: 'calendar', selected: 'calendar' }} />
        <NativeTabs.Trigger.Label>{t('tabs.calendar')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="shop" contentStyle={nativeTabContentStyle}>
        <NativeTabs.Trigger.Icon sf={{ default: 'bag', selected: 'bag.fill' }} />
        <NativeTabs.Trigger.Label>{t('tabs.shop')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="search"
        role="search"
        contentStyle={nativeTabContentStyle}
      />
    </NativeTabs>
  );
}
