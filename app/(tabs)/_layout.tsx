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
          borderBottomWidth: 0,
          borderTopWidth: 0,
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
          paddingHorizontal: 45,
          height: 66,
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'visible',
        },
        tabBarBackground: () => (
          isFuturistic ? (
            <View style={{ flex: 1, backgroundColor: '#000000' }} />
          ) : (
            <BlurView
              intensity={12}
              tint="dark"
              style={{
                position: 'absolute',
                left: 47.5,
                right: 47,
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
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
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
          marginTop: 6.5,
        },
        tabBarLabelPosition: isFuturistic ? 'beside-icon' : 'below-icon',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'TASKS',
          tabBarLabel: isFuturistic ? 'TASKS' : undefined,
          tabBarIcon: isFuturistic ? () => null : ({ color, size, focused }) => (
            <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative', width: 68, height: 50 }}>
              {focused && (
                <View
                  style={{
                    position: 'absolute',
                    top: 3,
                    bottom: -12,
                    left: -3,
                    right: -3,
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
                    top: 3,
                    bottom: -12,
                    left: -3,
                    right: -3,
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
          tabBarItemStyle: isFuturistic ? {
            justifyContent: 'center',
            paddingVertical: 0,
          } : {
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            position: 'relative',
          },
          tabBarIcon: isFuturistic ? () => null : ({ color, size, focused }) => (
            <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative', width: 68, height: 50 }}>
              {focused && (
                <View
                  style={{
                    position: 'absolute',
                    top: 3,
                    bottom: -12,
                    left: -3,
                    right: -3,
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
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            position: 'relative',
            marginLeft: -2,
          },
          tabBarIcon: isFuturistic ? () => null : ({ color, size, focused }) => (
            <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative', width: 68, height: 50, top: -1 }}>
              {focused && (
                <View
                  style={{
                    position: 'absolute',
                    top: 4,
                    bottom: -13,
                    left: -3,
                    right: -3,
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
