# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

This is **habit-check-native**, a React Native Expo (SDK 54) habit/task tracker app with Italian UI. It is a fully client-side app with no backend, no database server, and no external API dependencies. All data is persisted on-device via AsyncStorage.

### Development commands

Standard commands are in `package.json`:
- `npm install` — install dependencies
- `npm run lint` (or `npx expo lint`) — run ESLint
- `npx tsc --noEmit` — TypeScript type check
- `npm run web` (or `npx expo start --web`) — start web dev server
- `npm start` (or `npx expo start`) — start Expo dev server (for mobile devices)

### Known caveats

- **Skia on web**: `@shopify/react-native-skia` (used in `components/NoiseBackground.tsx` and `components/HabitItem.tsx`) crashes at runtime on web due to `Skia.RuntimeEffect` being undefined. To test on web, you need to add `Platform.OS === 'web'` guards around `Skia.RuntimeEffect.Make()` calls. This is only needed for web mode; native mobile mode works fine.
- **No formal test framework**: There is no Jest/Vitest/etc. configured. The only tests are ad-hoc scripts (`test_indices.js`, `test_merge.js`) at the repo root, runnable with `node test_indices.js` / `node test_merge.js`.
- **Pre-existing lint/TS errors**: The codebase has pre-existing ESLint warnings (unused variables, React hook deps) and TypeScript errors (missing module `@/lib/storage`, Skia type issues). These are not introduced by your changes.
- **Web mode is the only visual testing option** in this cloud VM (no Android emulator or iOS simulator available). Use `npx expo start --web --port 8081` and open Chrome to `http://localhost:8081`.
