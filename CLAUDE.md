# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start development server
npx expo start

# Platform-specific builds
npx expo run:ios
npx expo run:android
npx expo start --web

# Lint
npx expo lint
```

## Architecture

**Tothemoon** is a React Native habit tracking app (Expo SDK 55, React 19, New Architecture enabled). UI strings are in Italian.

### Routing

Expo Router with file-based routing under `/app`. Main tabs at `/app/(tabs)/`: `index` (task list), `oggi` (today timeline), `calendar`, `shop`. Modals: `modal.tsx` (create/edit habit), `places.tsx` (geofenced locations), `profile.tsx`.

### State Management

**`HabitsProvider`** (`/lib/habits/Provider.tsx`) is the central state manager via React Context. It holds:
- `habits`: array of `Habit` objects
- `history`: dictionary keyed by date (`YYYY-MM-DD`) tracking completions

Persisted to AsyncStorage with `tothemoon_*` keys, with fallback migration from legacy `habitcheck_*` keys. Timezone: Europe/Zurich.

Types are defined in `/lib/habits/schema.ts`.

### Key Logic Modules

| File | Purpose |
|------|---------|
| `lib/index/useIndexLogic.ts` | State machine for the main task list (drag, reorder, folder navigation, multi-select) |
| `lib/modal/useModalLogic.ts` | State machine for the habit create/edit modal form |
| `lib/layoutEngine.ts` | Column layout algorithm for overlapping time events in the "Oggi" timeline view |
| `lib/oggi/eventLayout.ts` | Event positioning helpers for the timeline |
| `lib/geofenceTask.ts` | Background task: auto-completes habits when exiting a geofenced location |
| `lib/habits/habitsForDate.ts` | Computes which habits are scheduled for a given date |

### UI & Theming

- Two visual modes: standard and "futuristic" (toggled via theme context)
- Heavy use of `@shopify/react-native-skia` for GPU-accelerated graphics
- `react-native-reanimated` for animations
- `expo-glass-effect` and `expo-linear-gradient` for backgrounds
- Dark theme enforced app-wide (`userInterfaceStyle: "dark"`)
- Path alias `@/*` maps to the repo root (configured in `tsconfig.json`)

### Background & Device Features

- Geofencing via `expo-location` + `expo-task-manager`
- Local notifications via `expo-notifications`
- Apple Calendar import via `expo-calendar`
- Haptic feedback via `expo-haptics`

### Development Notes

- `metro.config.js` binds to `0.0.0.0` for network access (Replit workflow)
- `patch-package` applies npm patches automatically on `postinstall`
- `start-dev.sh` / `auto-pull.sh` support a Replit + Expo Go workflow with auto-reload from a git branch
