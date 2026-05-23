# Workout Flow Redesign — Design Spec

**Date:** 2026-05-22  
**Author:** Claude (from brainstorming session)  
**Status:** Approved — proceeding to implementation plan

---

## Summary

Replace the current scrollable-list `ActiveWorkoutScreen` with a **card-stack focus flow** matching the `Workout Flow.html` design. The new UX shows one set at a time in a swipeable card, with a full-screen rest overlay after each logged set. The existing component API and navigation layer remain unchanged.

---

## Design Source

- `/Users/rohan/Downloads/fitfoworkouts/project/` — multi-file JSX design prototype
- Key files: `workout-app.jsx`, `set-card.jsx`, `rest-overlay.jsx`, `exercise-strip.jsx`, `edit-sheet.jsx`

---

## UX Paradigm

**Before:** Scrollable accordion list. Each exercise card expands to show all its sets. Users scroll and tap to log any set in any order.

**After:** Focus-mode card stack. Only one set is visible at a time. The cursor auto-advances to the next incomplete set after logging. Swipe right to log, swipe left to skip. A second card peeks behind the active one.

**User decision:** Option 1 — full focus mode. No scrollable fallback.

---

## Screen Structure

```
┌────────────────────────────────┐
│  [II]          TITLE  FINISH   │  ← top bar row 1 (icon buttons)
│  00:04:12 · IN PROGRESS  3/12  │  ← top bar row 2 (title + counter)
│  ▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░  │  ← progress bar (3px)
│  [Squat ●●●] [Bench ●●○]…     │  ← exercise strip (horizontal scroll)
│                                │
│         ┌────────────┐         │
│         │  SET CARD  │         │  ← top card (interactive, swipeable)
│       ┌─┤            ├─┐       │  ← background card peek
│       │ │  EXERCISE  │ │       │
│       │ │  Weight    │ │       │
│       │ │  Reps      │ │       │
│       │ │  [Skip] [LOG SET]   │ │
│       └─┴────────────┴─┘       │
└────────────────────────────────┘
```

---

## Component Inventory

### 1. `ActiveWorkoutScreen` (rewrite, same file)

**Props (unchanged):**
```ts
session: ActiveSessionPreview
onBack: () => void
onFinish: (session: ActiveSessionPreview) => void
coachMessages: CoachChatMessage[]
setCoachMessages: Dispatch<SetStateAction<CoachChatMessage[]>>
onCoachButtonMeasured?: ...
coachOpenRequestId?: number
hubTourStep?: ...
themeMode?: ThemeMode
resolveLastLiftLabel?: ...
resolveExerciseLiftSummary?: ...
userId?: string | null
onOpenSuggestFeatures?: () => void
```

**New internal state:**
- `exercises: ActiveExercisePreview[]` — mutable workout state (same as before)
- `cursor: { exerciseIndex, setIndex } | null` — derived, points to next incomplete set
- `stack: { exercise, exerciseIndex, set, setIndex }[]` — top 2 cards (derived from cursor)
- `restState: { targetSeconds, exerciseIndex, setIndex } | null`
- `editingExerciseId: string | null`
- `showOverview: boolean`
- `showFinish: boolean`
- `coachOpen: boolean`
- `elapsed: number` — workout elapsed seconds (same timer logic as before)

**`cursor` derivation:** iterate exercises/sets in order; return first `{ exerciseIndex, setIndex }` where `!set.completed && !set.skipped`. Returns `null` when all done.

**`stack` derivation:** from cursor, walk forward collecting up to 2 incomplete sets (across exercise boundaries).

### 2. `WorkoutTopBar` (new component, same file or extracted)

- Row 1: pause icon | [gap] | coach icon + overview icon + FINISH pill button  
- Row 2: elapsed eyebrow (`00:04:12 · IN PROGRESS`) + workout title | `{done}/{total} SETS`
- Progress bar: `height: 3, borderRadius: 999`, fill width = `(done/total)*100%`, gradient `primary → primaryBright`
- FINISH button: primary bg when `done > 0`, muted otherwise

### 3. `WorkoutExerciseStrip` (new component)

- Horizontal `ScrollView` (no scrollbar) of exercise chips
- Each chip: index number + exercise name (truncated) + row of set dots
  - Dot colors: green = completed, orange = current set, dim = upcoming
- Current exercise chip: primary border + surfaceStrong bg
- Auto-scrolls to keep current exercise visible

### 4. `WorkoutSetCard` (new component)

**Card chrome:**
- Background: `linear-gradient(180deg, #1c1815, #121110)` — dark card
- Border: `borderSoft`, radius 24
- Shadow: heavy (`0 24px 60px rgba(0,0,0,.55)`)

**Inside (top to bottom):**
1. `SKIP` label (top-left, fades in on left-swipe) + `LOG` label (top-right, fades in on right-swipe)
2. Header: `{blockName} · {index padded}` eyebrow + exercise name (26px bold) + "•••" edit button
3. Set chip row: `SET X OF Y` pill (primary bg) + dot pills + `−` / `+` set count buttons
4. Last-session hint row (if `resolveLastLiftLabel` returns a value)
5. Input area:
   - Reps mode: Weight input (left, flex 1.2) + Reps input (right, flex 1)
   - Timed mode: Hold Time input (full width)
   - Each input: big 40px font, label above, unit below/after, border highlights on focus
6. First-set swipe hint (animated ← SKIP · SWIPE · LOG →, only on first set before first drag)
7. Bottom actions: `[Skip]` outline button + `[LOG SET →]` primary button (disabled until weight+reps filled)

**Gesture (react-native-gesture-handler + reanimated):**
- `PanGesture` on the card
- Translates + rotates card: `rotate = dx * 0.04deg`
- `LOG` hint opacity = `clamp(dx / SWIPE_THRESHOLD, 0, 1)` where `SWIPE_THRESHOLD = 110`
- `SKIP` hint opacity = `clamp(-dx / SWIPE_THRESHOLD, 0, 1)`
- On release: if `dx > 110 && canCommit` → fly right (translateX 600) → call `onLog`
- On release: if `dx < -110` → fly left → call `onSkip`
- Otherwise: spring back to center
- Background card: `translateY(8px) scale(0.965) opacity(0.85)`, no pointer events

**canCommit:** for weight+reps mode: `weight.trim() && reps.trim()`; for timed: `reps.trim()`

### 5. `WorkoutRestOverlay` (new component)

- Full-screen dark overlay (`rgba(8,8,8,.96)` + blur)
- Header: `REST` eyebrow + `Set logged ✓` + `Skip rest` pill button
- Center: SVG circular ring (220px diameter, stroke 8px)
  - Track: `surfaceStrong`
  - Progress arc: `primary`, `strokeDashoffset` animates as `remaining/target` decreases
  - Center text: remaining seconds (56px bold) + `RESTING` / `READY` label
- ±15s adjustment buttons (pill shape, `surface-2` bg)
- "Up Next" card: exercise name + set label
- "I'm ready — continue" full-width white button
- Auto-dismisses when `elapsed >= targetSeconds` → calls `onDone`

### 6. `WorkoutEditSheet` (new component)

Bottom sheet (Modal + slide-up Animated.View):
- Handle pill (38×4)
- Exercise name header + close button
- **Mode toggle:** `Sets · Reps` / `Sets · Time` (pill toggle)
- **Rows with steppers:**
  - Number of sets (stepper, 1–20)
  - Target reps (stepper, 1–50) — reps mode only
  - Target weight (stepper, 0–1000, step 5, suffix "lb") — reps mode only
  - Target hold time (stepper, 5–600, step 5, suffix "s") — timed mode only
  - Rest between sets (stepper, 0–600, step 15, suffix "s")
- "Remove exercise from workout" danger button
- "Done" primary button

**Stepper component:** `−` button + centered value display + `+` button (34×34 each)

### 7. `WorkoutOverviewSheet` (new component)

Bottom sheet:
- Handle + workout title header + close button
- List of exercises: index badge (or ✓ if done) + name + `done/total sets · rest` + dot pills + remove (trash) button
  - Confirm-to-remove: shows "Keep" + red trash confirm inline
- "Add exercise" row (dashed border, expands to name input inline)

### 8. `WorkoutFinishModal` (new component)

Centered modal overlay (blur background):
- `WORKOUT SUMMARY` eyebrow + "Finish workout?" heading
- Stats grid (3 cols): Sets done | Time elapsed | Volume (weight × reps, formatted as `Xk lb`)
- Skipped sets warning (if any)
- "Save & finish" primary button → calls existing `onFinish`
- "Keep going" ghost button → dismisses modal

### 9. `WorkoutFinishedHero` (inline)

Shown in place of card stack when `cursor === null`:
- Large checkmark circle (primary gradient, glow shadow)
- "All sets done" heading
- "You crushed it. Hit finish to save and review your session."
- "Finish workout" primary button

---

## Data Operations

**Log set:**
1. Mark `set.completed = true`, fill `loggedWeight`/`loggedReps` from inputs (or target if blank)
2. Start `restState` if exercise has `restSeconds > 0`
3. Advance cursor (auto-derived from `exercises` state)
4. Live Activity update (same as before)

**Skip set:**
1. Mark `set.skipped = true` (new field on `ActiveSetPreview` — optional, safe to add)
2. No rest timer
3. Cursor advances

**Add set:** append set to exercise matching last set's targets  
**Remove set:** pop last set from exercise  
**Edit exercise:** batch-update all sets in exercise with new targets/rest  
**Remove exercise:** filter from exercises array  
**Add exercise:** append new exercise with 3 default sets

---

## Skipped Sets

`ActiveSetPreview` needs a new optional field: `skipped?: boolean`

The existing `isSetReadyToComplete` and completion checks ignore `skipped`. The cursor derivation skips both `completed` and `skipped` sets. The `onFinish` payload still passes the full session (skipped sets included with blank values).

---

## Colors (dark theme)

The design is dark-only. All new components use `darkColors` from `theme.ts`:

| Design token | App token |
|---|---|
| `--bg: #080808` | `darkColors.background` |
| `--surface: #151515` | `darkColors.surface` |
| `--surface-2: #1e1e1e` | `darkColors.surfaceMuted` |
| `--surface-3: #262626` | `darkColors.surfaceStrong` |
| `--border: #2d2824` | `darkColors.borderSoft` |
| `--text: #fff8f5` | `darkColors.textPrimary` |
| `--text-muted: #8a8078` | `darkColors.textMuted` |
| `--primary: #ff6f22` | `darkColors.primary` |
| `--success: #31c48d` | `darkColors.success` |
| `--danger: #ff5a4c` | `darkColors.error` |

Since the card stack is always dark, components will use `darkColors` directly (not the theme-switched values). The top-level `themeMode` prop is retained for future use but the workout screen always renders dark.

---

## Typography

Design uses Inter. App uses Satoshi. Map:
- Bold/800 weight → `Satoshi-Bold` (`fontFamily: "Satoshi-Bold"`)
- Medium/600 weight → `Satoshi-Medium`
- Regular → `Satoshi-Regular`
- Monospace numbers → still Satoshi (no JetBrains Mono in app)

---

## Animations & Gestures

- **Card swipe:** `react-native-gesture-handler` `Gesture.Pan()` + `react-native-reanimated` `useAnimatedStyle`, `useSharedValue`, `withSpring`, `runOnJS`
- **Card fly-off:** `withTiming(600, { duration: 240 })` for commit, `withSpring(0)` for return
- **Rest ring:** `react-native-svg` `Circle` with `strokeDashoffset` driven by `Animated.Value` or inline computed from elapsed state
- **Sheet slide-up:** React Native `Animated.Value` + `Animated.View` with `translateY`
- **Progress bar width:** `Animated.Value` or inline `width: (done/total)*100%` (no animation needed initially)

---

## Files to Change

| File | Change |
|---|---|
| `apps/mobile/src/screens/ActiveWorkoutScreen.tsx` | Full rewrite |
| `apps/mobile/src/types.ts` | Add `skipped?: boolean` to `ActiveSetPreview` |

New components will live inside `ActiveWorkoutScreen.tsx` initially (same pattern as existing `SetRow`/`ExerciseCard`). If the file becomes unwieldy, we can extract to `apps/mobile/src/components/workout/` — but not planned for this iteration.

---

## Out of Scope

- `WorkoutSummaryScreen` — unchanged
- Onboarding / Auth / Paywall — untouched
- Backend / API — no changes
- Light mode for workout screen — dark only for now
- Replay/history in card flow — existing `resolveLastLiftLabel` prop used as-is
