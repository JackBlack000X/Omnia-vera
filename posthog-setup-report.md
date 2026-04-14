<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into **Tothemoon**, a React Native Expo habit tracker. The integration covers event tracking across the full user lifecycle — from first launch through daily habit completion — as well as feature adoption signals, geofence place management, day review engagement, smart task scheduling feedback, and language preference changes.

## Changes made

| File | Change |
|------|--------|
| `lib/posthog.ts` | PostHog client singleton (reads token + host from `expo-constants` extras) |
| `app.config.js` | Expo config wrapper that exposes `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` env vars as `extra` fields |
| `.env` | `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` (covered by `.gitignore`) |
| `app/_layout.tsx` | `PostHogProvider`, screen tracking via `usePathname`, and `intro_completed` event |
| `lib/modal/useModalLogic.ts` | `habit_created` and `habit_updated` events on successful save |
| `lib/index/useIndexLogic.ts` | `habit_completed`, `habit_uncompleted`, `folder_created`, `folder_deleted` events |
| `components/HabitItem.tsx` | `habit_deleted` event on swipe-to-delete |
| `app/(tabs)/index.tsx` | `habit_deleted` (bulk), `smart_task_feedback_submitted`, `habit_duplicated`, `day_scope_changed` events |
| `app/(tabs)/shop.tsx` | `shop_item_tapped` event on themes button |
| `app/profile.tsx` | `calendar_imported`, `health_connected`, `location_permission_granted`, `feedback_sent`, `data_exported_csv`, `language_changed` events |
| `lib/geofenceTask.ts` | `geofence_habit_autocompleted` event in background geofence task |
| `app/places.tsx` | `place_created`, `place_updated`, `place_deleted` events for geofence place management |
| `app/(tabs)/oggi.tsx` | `day_review_completed` event when user submits a day review |
| `components/index/TableTaskCreateOverlay.tsx` | `table_task_created` event when a task is created from the Tabelle view |

## Events tracked

| Event | Description | File |
|-------|-------------|------|
| `intro_completed` | First-time user finishes the intro video (top of conversion funnel) | `app/_layout.tsx` |
| `habit_created` | User saves a new habit from the create/edit modal | `lib/modal/useModalLogic.ts` |
| `habit_updated` | User saves edits to an existing habit | `lib/modal/useModalLogic.ts` |
| `habit_deleted` | User deletes a habit (swipe or bulk) | `components/HabitItem.tsx`, `app/(tabs)/index.tsx` |
| `habit_duplicated` | User confirms duplicating an existing habit | `app/(tabs)/index.tsx` |
| `habit_completed` | User marks a habit as done | `lib/index/useIndexLogic.ts` |
| `habit_uncompleted` | User un-marks a completed habit | `lib/index/useIndexLogic.ts` |
| `folder_created` | User creates a new habit folder/group | `lib/index/useIndexLogic.ts` |
| `folder_deleted` | User deletes a habit folder | `lib/index/useIndexLogic.ts` |
| `smart_task_feedback_submitted` | User rates smart task scheduling (justRight / tooEarly / tooLate) | `app/(tabs)/index.tsx` |
| `shop_item_tapped` | User taps a shop item (currently themes-coming-soon) | `app/(tabs)/shop.tsx` |
| `table_task_created` | User creates a task from the Tabelle view overlay | `components/index/TableTaskCreateOverlay.tsx` |
| `day_scope_changed` | User switches task list between today / yesterday / tomorrow | `app/(tabs)/index.tsx` |
| `calendar_imported` | Apple Calendar events successfully imported as habits | `app/profile.tsx` |
| `health_connected` | User successfully connects HealthKit | `app/profile.tsx` |
| `location_permission_granted` | User grants location permission for geofencing | `app/profile.tsx` |
| `feedback_sent` | User opens the mail client to send in-app feedback | `app/profile.tsx` |
| `data_exported_csv` | User exports habit history as CSV | `app/profile.tsx` |
| `language_changed` | User changes the app language preference | `app/profile.tsx` |
| `geofence_habit_autocompleted` | Habits auto-completed on geofence exit (background task) | `lib/geofenceTask.ts` |
| `place_created` | User saves a new geofence location | `app/places.tsx` |
| `place_updated` | User edits and saves an existing geofence location | `app/places.tsx` |
| `place_deleted` | User deletes a geofence location | `app/places.tsx` |
| `day_review_completed` | User submits a day review for a past date | `app/(tabs)/oggi.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://eu.posthog.com/project/159146/dashboard/621063
- **Habit completion rate (daily)**: https://eu.posthog.com/project/159146/insights/xAWw1bxm
- **Habit creation funnel**: https://eu.posthog.com/project/159146/insights/upDOhCqH
- **User retention (weekly)**: https://eu.posthog.com/project/159146/insights/snM0Pr1z
- **Smart task feedback breakdown**: https://eu.posthog.com/project/159146/insights/EHWiq1e2
- **Feature adoption overview**: https://eu.posthog.com/project/159146/insights/imtlFdCl

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-expo/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
