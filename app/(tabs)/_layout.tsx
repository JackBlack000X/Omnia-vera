import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: '#e5e7eb',
        tabBarStyle: {
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
          <BlurView
            intensity={12}
            tint="dark"
            style={{
              position: 'absolute',
              left: 40,  // Aggiunge margine interno sinistro (riduce la barra)
              right: 40, // Aggiunge margine interno destro (riduce la barra)
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
        ),
        tabBarItemStyle: {
          marginHorizontal: 10,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          flex: 0,
          width: 68,
          position: 'relative',
        },
        tabBarLabelStyle: {
          fontWeight: '700',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginTop: 29,
        },
        tabBarButtonStyle: {
          borderRadius: 20,
          marginHorizontal: 6,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Abitudini',
          tabBarIcon: ({ color, size, focused }) => (
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
          title: 'Oggi',
          tabBarIcon: ({ color, size, focused }) => (
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
          title: 'Calendario',
          tabBarIcon: ({ color, size, focused }) => (
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
          title: 'Shop',
          tabBarItemStyle: {
            marginHorizontal: 10,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            flex: 0,
            width: 68,
            position: 'relative',
            transform: [{ translateX: -4 }, { translateY: 1 }],
          },
          tabBarIcon: ({ color, size, focused }) => (
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
