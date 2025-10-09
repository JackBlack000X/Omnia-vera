import { Platform } from 'react-native';

export const THEME = {
  background: '#000000',
  surface: '#000000',
  surfaceSecondary: '#000000',
  text: '#ffffff',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  border: '#334155',
  borderSecondary: '#475569',
  accent: '#e11d48',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  primary: '#2563eb',
  purple: '#8b5cf6',
  pink: '#ec4899',
  cyan: '#22d3ee',
  orange: '#f97316',
  green: '#34d399',
  indigo: '#6366f1',
};

export const GRADIENT_COLORS = {
  progress: ['#60a5fa', '#a855f7', '#22d3ee'],
  spines: [
    ['#e91e63', '#ec407a'],
    ['#00bcd4', '#03a9f4'],
    ['#f59e0b', '#f97316'],
    ['#34d399', '#10b981']
  ],
};

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: '#0a7ea4',
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: '#0a7ea4',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: '#fff',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: '#fff',
  },
};

export const Fonts = {
  mono: Platform.select({
    ios: 'Courier New',
    android: 'monospace',
    web: 'Courier New',
  }),
};