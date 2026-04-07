# Shop Design Unlock Morph

## Goal

Replace the current `Other themes soon` capsule in `app/(tabs)/shop.tsx` with an inline liquid glass interaction on iPhone.

When the user taps the arrow, the same glass capsule should expand smoothly instead of opening a separate menu. The closed state acts like a teaser. The open state explains how future designs will work and offers a way to submit a design application by email.

## User Experience

### Closed state

- Show a compact liquid glass capsule.
- Primary text: `Other themes soon`
- Trailing affordance: arrow button
- Supporting text below the capsule: `Classic design is the only available option for now.`

### Open state

- The same capsule animates wider/taller in place.
- The closed-state label fades/slides out.
- Expanded content fades/slides in inside the same `GlassView`.
- The supporting text below the capsule disappears while open.
- The trailing arrow changes to a close affordance or rotated chevron.

## Expanded Content

### Section 1: Unlocking future designs

- Title: `Unlock future designs`
- Body copy explains that users will be able to unlock new designs in the future by building streaks.

### Section 2: Submit a design

- Body copy explains that users can send a design application to the developer if they want to propose a theme for the app.
- Placeholder email address: `designs@tothemoon.app`
- If the design is accepted, the copy should explain that the creator may earn money when users choose that design.

### Actions

- Primary action: `Send application`
- Secondary action: `Maybe later`

`Send application` opens the mail app with a `mailto:` link to the placeholder address.

`Maybe later` collapses the capsule back to the closed state.

## Interaction Design

- Only the arrow affordance should open or close the expanded state.
- The capsule body itself should remain visually tappable but not trigger navigation elsewhere for now.
- The transition should feel smooth and premium, not bouncy or playful.
- Prefer a short ease animation for height, width, opacity, and icon rotation.

## Component Structure

- Keep the implementation inside `app/(tabs)/shop.tsx` unless the file becomes noticeably harder to read.
- Add local component state for open/closed status.
- Keep `GlassView` as the outer visual surface.
- Use React Native layout + animation primitives already available in the app.

## Content Tone

- Keep copy concise and premium.
- Avoid overexplaining monetization.
- Keep the message aspirational, not contractual.

## Error Handling

- If the mail app cannot open, fail gracefully without crashing.
- The UI should remain usable if the user dismisses the mail composer.

## Testing

- Verify the closed state still renders correctly in the Shop tab.
- Verify tapping the arrow expands the glass capsule in place.
- Verify the support text below disappears when expanded and returns when collapsed.
- Verify `Send application` attempts to open the `mailto:` link.
- Verify `Maybe later` collapses the capsule.

## Out of Scope

- Real backend unlock logic for streak-based design rewards
- Real revenue sharing logic
- Real creator onboarding flow
- Persisting open/closed state across launches
- Replacing the placeholder email with a real one