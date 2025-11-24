import { useAppTheme } from '@/lib/theme-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const { activeTheme } = useAppTheme();
  const insets = useSafeAreaInsets();

  const isFuturistic = activeTheme === 'futuristic';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarActiveTintColor: isFuturistic ? '#ffffff' : '#3b82f6',
        tabBarInactiveTintColor: isFuturistic ? '#666666' : '#e5e7eb',
        tabBarStyle: isFuturistic ? {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 50 + insets.top,
          backgroundColor: 'transparent',
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.1)',
          elevation: 0,
          paddingTop: insets.top,
          paddingBottom: 0,
        } : {
          position: 'absolute',
          left: 20,
          right: 20,
          bottom: 16,
          borderRadius: 35,
          backgroundColor: 'transparent',
          borderWidth: 0,
          borderTopWidth: 0,
          borderTopColor: 'transparent',
          paddingVertical: 8,
          height: 66,
          justifyContent: 'space-between',
          alignItems: 'center',
          overflow: 'visible',
        },
        tabBarBackground: () => (
          isFuturistic ? (
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
          ) : (
            <BlurView
              intensity={12}
              tint="dark"
              style={{
                position: 'absolute',
                left: 40,
                right: 40,
                top: 0,
                bottom: 0,
                borderRadius: 35,
                overflow: 'hidden',
              }}
            >
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  borderRadius: 35,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.12)'
                }}
              />
            </BlurView>
          )
        ),
        tabBarItemStyle: isFuturistic ? {
          justifyContent: 'center',
          paddingVertical: 0,
        } : {
          marginHorizontal: 10,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          flex: 0,
          width: 68,
          position: 'relative',
        },
        tabBarLabelStyle: isFuturistic ? {
          fontSize: 14,
          fontWeight: '600',
          letterSpacing: 1,
          textTransform: 'uppercase',
        } : {
          fontWeight: '700',
          marginTop: 2,
        },
        tabBarIconStyle: isFuturistic ? { display: 'none' } : {
          marginTop: 29,
        },
        tabBarLabelPosition: isFuturistic ? 'beside-icon' : 'below-icon',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'ABITUDINI',
          tabBarLabel: isFuturistic ? 'TASKS' : undefined,
          tabBarIcon: isFuturistic ? () => null : ({ color, size, focused }) => (
            <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative', width: 68, height: 50 }}>
              {focused && (
                <View
                  style={{
                    position: 'absolute',
                    top: 5,
                    bottom: -14,
                    left: -5,
                    right: -5,
                    borderRadius: 35,
                    backgroundColor: 'rgba(255,255,255,0.18)',
                    borderWidth: 0,
                  }}
                />
              )}
              <Ionicons name="list-outline" color={color} size={size ?? 24} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="oggi"
        options={{
          title: 'OGGI',
          tabBarLabel: isFuturistic ? 'OGGI' : undefined,
          tabBarIcon: isFuturistic ? () => null : ({ color, size, focused }) => (
            <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative', width: 68, height: 50 }}>
              {focused && (
                <View
                  style={{
                    position: 'absolute',
                    top: 5,
                    bottom: -14,
                    left: -5,
                    right: -5,
                    borderRadius: 35,
                    backgroundColor: 'rgba(255,255,255,0.18)',
                    borderWidth: 0,
                  }}
                />
              )}
              <Ionicons name="today-outline" color={color} size={size ?? 24} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'CALENDARIO',
          tabBarLabel: isFuturistic ? 'CAL' : undefined,
          tabBarIcon: isFuturistic ? () => null : ({ color, size, focused }) => (
            <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative', width: 68, height: 50 }}>
              {focused && (
                <View
                  style={{
                    position: 'absolute',
                    top: 5,
                    bottom: -14,
                    left: -5,
                    right: -5,
                    borderRadius: 35,
                    backgroundColor: 'rgba(255,255,255,0.18)',
                    borderWidth: 0,
                  }}
                />
              )}
              <Ionicons name="calendar-outline" color={color} size={size ?? 24} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: 'SHOP',
          tabBarLabel: isFuturistic ? 'SHOP' : undefined,
          tabBarItemStyle: isFuturistic ? {
             justifyContent: 'center',
             paddingVertical: 0,
          } : {
            marginHorizontal: 10,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            flex: 0,
            width: 68,
            position: 'relative',
            transform: [{ translateX: -4 }, { translateY: 1 }],
          },
          tabBarIcon: isFuturistic ? () => null : ({ color, size, focused }) => (
            <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative', width: 68, height: 50 }}>
              {focused && (
                <View
                  style={{
                    position: 'absolute',
                    top: 5,
                    bottom: -14,
                    left: -5,
                    right: -5,
                    borderRadius: 35,
                    backgroundColor: 'rgba(255,255,255,0.18)',
                    borderWidth: 0,
                  }}
                />
              )}
              <Ionicons name="bag-handle-outline" color={color} size={size ?? 24} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
