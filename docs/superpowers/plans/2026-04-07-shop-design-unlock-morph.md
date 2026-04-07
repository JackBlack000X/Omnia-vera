# Shop Design Unlock Morph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `Other themes soon` capsule in `app/(tabs)/shop.tsx` into an inline liquid glass morph that expands in place, explains future design unlocks via streaks, and opens a placeholder design-application email.

**Architecture:** Keep the feature local to `app/(tabs)/shop.tsx` with local UI state, existing `GlassView`, and a small set of inline copy constants. Use `LayoutAnimation` for the capsule morph and lightweight `Animated` values for content fade/arrow rotation so the interaction feels premium without introducing new files or dependencies.

**Tech Stack:** Expo Router, React Native, `expo-glass-effect`, `Ionicons`, `Linking`, `Alert`, `LayoutAnimation`, `Animated`

---

## File Map

- Modify: `app/(tabs)/shop.tsx`
  - Add local state for `isExpanded`
  - Add inline copy/constants for the expanded content
  - Add expand/collapse handler tied only to the arrow affordance
  - Replace the current single-line glass capsule body with closed/open states
  - Add `mailto:` handling with graceful failure
- Verify: `app/(tabs)/shop.tsx`
  - Lint the file directly
  - Reload the already-running iOS simulator and manually verify the transition

## Pre-Checks

- The repo currently has no UI test harness (`*.test.*` files are absent and there is no Jest/Vitest setup in `package.json`), so this plan uses reproducible manual verification plus linting instead of adding new test infrastructure for a single-screen iPhone-only interaction.
- Use the already running Expo iOS dev build if available. If Metro is not running, start it with `npx expo start`.

### Task 1: Add Local State And Copy Model

**Files:**
- Modify: `app/(tabs)/shop.tsx`

- [ ] **Step 1: Reproduce the current failing behavior**

Run the app, go to the `Shop` tab, and tap the arrow inside the `Other themes soon` capsule.

Expected before changes:
- The arrow does nothing
- No expanded copy appears
- No email action exists

- [ ] **Step 2: Add the state, imports, and copy constants**

Update the top of `app/(tabs)/shop.tsx` so the screen has everything needed for the morph interaction:

```tsx
import { Ionicons } from '@expo/vector-icons';
import { GlassView } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DESIGN_APPLICATION_EMAIL = 'designs@tothemoon.app';
const DESIGN_APPLICATION_SUBJECT = 'Tothemoon design application';
const DESIGN_APPLICATION_BODY = [
  'Hi,',
  '',
  'I want to submit a design concept for Tothemoon.',
  '',
  'Name:',
  'Design title:',
  'Short pitch:',
  '',
  'Thanks,',
].join('\n');

const CLOSED_LABEL = 'Other themes soon';
const CLOSED_SUBLABEL = 'Classic design is the only available option for now.';
const EXPANDED_TITLE = 'Unlock future designs';
const EXPANDED_STREAK_COPY = 'Build streaks and you will be able to unlock new app designs in future updates.';
const EXPANDED_CREATOR_COPY = 'Want to propose a theme for the app? Send your application to the developer. If your design is accepted, you may earn when people choose it.';
```

Then add local screen state near the router:

```tsx
export default function ShopScreen() {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const arrowRotation = useRef(new Animated.Value(0)).current;

  const arrowRotate = useMemo(
    () => arrowRotation.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '180deg'],
    }),
    [arrowRotation]
  );
```

- [ ] **Step 3: Enable iOS layout animation once**

Add the one-time enable guard right after the screen state:

```tsx
  if (Platform.OS === 'ios' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
```

- [ ] **Step 4: Run lint on the file**

Run: `npx eslint "app/(tabs)/shop.tsx"`

Expected: exit code `0`

### Task 2: Add Expand/Collapse Behavior

**Files:**
- Modify: `app/(tabs)/shop.tsx`

- [ ] **Step 1: Add the expand/collapse handlers**

Add two local callbacks below the state section:

```tsx
  const animateExpandedState = (nextExpanded: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: nextExpanded ? 1 : 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(arrowRotation, {
        toValue: nextExpanded ? 1 : 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    setIsExpanded(nextExpanded);
  };

  const handleToggleExpanded = () => {
    animateExpandedState(!isExpanded);
  };
```

- [ ] **Step 2: Replace the arrow bubble with a pressable arrow control**

Inside the `GlassView`, keep the main capsule but make only the arrow affordance toggle the expanded state:

```tsx
<Pressable
  accessibilityRole="button"
  accessibilityLabel={isExpanded ? 'Close design info' : 'Open design info'}
  hitSlop={10}
  onPress={handleToggleExpanded}
  style={styles.optionArrowBubble}
>
  <Animated.View style={{ transform: [{ rotate: arrowRotate }] }}>
    <Ionicons name="chevron-down" size={16} color="white" />
  </Animated.View>
</Pressable>
```

- [ ] **Step 3: Add the closed/open content swap inside the same glass surface**

Replace the current single-line content block with a conditional layout:

```tsx
<GlassView
  glassEffectStyle="regular"
  colorScheme="dark"
  isInteractive
  style={[styles.optionGlass, isExpanded && styles.optionGlassExpanded]}
>
  {!isExpanded ? (
    <>
      <Text style={styles.optionText}>{CLOSED_LABEL}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open design info"
        hitSlop={10}
        onPress={handleToggleExpanded}
        style={styles.optionArrowBubble}
      >
        <Animated.View style={{ transform: [{ rotate: arrowRotate }] }}>
          <Ionicons name="chevron-down" size={16} color="white" />
        </Animated.View>
      </Pressable>
    </>
  ) : (
    <Animated.View style={[styles.expandedContent, { opacity: contentOpacity }]}>
      <View style={styles.expandedHeaderRow}>
        <Text style={styles.expandedTitle}>{EXPANDED_TITLE}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close design info"
          hitSlop={10}
          onPress={handleToggleExpanded}
          style={styles.optionArrowBubble}
        >
          <Animated.View style={{ transform: [{ rotate: arrowRotate }] }}>
            <Ionicons name="chevron-down" size={16} color="white" />
          </Animated.View>
        </Pressable>
      </View>

      <Text style={styles.expandedParagraph}>{EXPANDED_STREAK_COPY}</Text>
      <Text style={styles.expandedParagraph}>{EXPANDED_CREATOR_COPY}</Text>
      <Text style={styles.expandedEmail}>{DESIGN_APPLICATION_EMAIL}</Text>

      <View style={styles.expandedActionsRow}>
        {/* buttons added in Task 3 */}
      </View>
    </Animated.View>
  )}
</GlassView>
```

- [ ] **Step 4: Hide the supporting subtitle while expanded**

Change the subtitle rendering from unconditional to conditional:

```tsx
{!isExpanded ? (
  <Text style={styles.optionSubText}>{CLOSED_SUBLABEL}</Text>
) : null}
```

- [ ] **Step 5: Add the expanded-state styles**

Extend `StyleSheet.create` with the styles needed for the morph:

```tsx
optionGlassExpanded: {
  minWidth: 320,
  minHeight: 236,
  borderRadius: 28,
  paddingTop: 18,
  paddingBottom: 18,
  paddingHorizontal: 18,
  alignItems: 'stretch',
  justifyContent: 'flex-start',
},
expandedContent: {
  width: '100%',
  gap: 12,
},
expandedHeaderRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
},
expandedTitle: {
  color: 'white',
  fontSize: 18,
  fontWeight: '700',
  flex: 1,
},
expandedParagraph: {
  color: '#e5e7eb',
  fontSize: 14,
  lineHeight: 20,
},
expandedEmail: {
  color: 'rgba(255,255,255,0.88)',
  fontSize: 13,
  fontWeight: '600',
},
expandedActionsRow: {
  flexDirection: 'row',
  gap: 10,
  marginTop: 4,
},
```

- [ ] **Step 6: Run lint again**

Run: `npx eslint "app/(tabs)/shop.tsx"`

Expected: exit code `0`

### Task 3: Add The Mail Action And Finish The Expanded CTA

**Files:**
- Modify: `app/(tabs)/shop.tsx`

- [ ] **Step 1: Add the mailto builder and open handler**

Insert these helpers inside `ShopScreen`:

```tsx
  const designApplicationHref = useMemo(() => {
    const subject = encodeURIComponent(DESIGN_APPLICATION_SUBJECT);
    const body = encodeURIComponent(DESIGN_APPLICATION_BODY);
    return `mailto:${DESIGN_APPLICATION_EMAIL}?subject=${subject}&body=${body}`;
  }, []);

  const handleSendApplication = async () => {
    try {
      const supported = await Linking.canOpenURL(designApplicationHref);
      if (!supported) {
        Alert.alert('Mail unavailable', 'Set up Mail to send your design application.');
        return;
      }
      await Linking.openURL(designApplicationHref);
    } catch {
      Alert.alert('Mail unavailable', 'Set up Mail to send your design application.');
    }
  };
```

- [ ] **Step 2: Fill the expanded action row**

Replace the placeholder comment in `expandedActionsRow` with two actions:

```tsx
<View style={styles.expandedActionsRow}>
  <TouchableOpacity activeOpacity={0.86} onPress={handleSendApplication} style={styles.primaryActionButton}>
    <Text style={styles.primaryActionText}>Send application</Text>
  </TouchableOpacity>

  <TouchableOpacity activeOpacity={0.86} onPress={handleToggleExpanded} style={styles.secondaryActionButton}>
    <Text style={styles.secondaryActionText}>Maybe later</Text>
  </TouchableOpacity>
</View>
```

- [ ] **Step 3: Add the action button styles**

Extend the stylesheet:

```tsx
primaryActionButton: {
  flex: 1,
  minHeight: 42,
  borderRadius: 16,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(255,255,255,0.18)',
},
primaryActionText: {
  color: 'white',
  fontSize: 14,
  fontWeight: '700',
},
secondaryActionButton: {
  minHeight: 42,
  paddingHorizontal: 14,
  borderRadius: 16,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(255,255,255,0.08)',
},
secondaryActionText: {
  color: '#e5e7eb',
  fontSize: 14,
  fontWeight: '600',
},
```

- [ ] **Step 4: Run lint**

Run: `npx eslint "app/(tabs)/shop.tsx"`

Expected: exit code `0`

- [ ] **Step 5: Manual iPhone verification in the simulator**

Use the already-running iOS dev build and check the full flow:

1. Open the `Shop` tab.
2. Confirm the closed capsule still shows `Other themes soon`.
3. Tap only the arrow.
4. Confirm the glass surface expands in place.
5. Confirm the old subtitle disappears.
6. Confirm the new title, streak explanation, creator explanation, and placeholder email appear.
7. Tap `Maybe later` and confirm it collapses.
8. Re-open and tap `Send application`.
9. Confirm iOS attempts to open Mail or shows the fallback alert instead of crashing.

Expected: all interactions work and the screen remains stable.

## Self-Review Checklist

- Spec coverage:
  - Inline morph: covered in Task 2
  - Streak unlock messaging: covered in Task 2
  - Developer application and earnings copy: covered in Task 2
  - `Send application` and `Maybe later`: covered in Task 3
  - Graceful mail failure: covered in Task 3
- Placeholder scan:
  - No `TODO`, `TBD`, or vague “handle later” language remains
- Type consistency:
  - `isExpanded`, `handleToggleExpanded`, and `handleSendApplication` are used consistently throughout the tasks
