# Fitfo Live Activity

iOS Live Activity (ActivityKit + WidgetKit + SwiftUI) that shows the current
exercise, set count, and rest countdown on the Lock Screen and in the Dynamic
Island during an active workout.

## How it's wired

- `FitFoLiveActivity.swift` — `WidgetBundle` + `Widget` + Lock Screen / Dynamic
  Island SwiftUI views.
- `FitFoWorkoutAttributes.swift` — `ActivityAttributes` shared shape. The
  matching `Fitfo/LiveWorkoutActivity/FitFoWorkoutAttributesShared.swift` keeps
  an identical copy inside the main app so the RN bridge can request and update
  activities against the same type the widget renders.
- `Assets.xcassets/FitFoLogo.imageset` — the orange Fitfo brand mark shown in
  the lock-screen header and Dynamic Island (compact + minimal). Sourced from
  `apps/mobile/assets/vector-no-bg.png`; loaded in SwiftUI as
  `Image("FitFoLogo")`. The asset catalog is registered to the widget target by
  `scripts/setup-live-activity.js`.
- `Info.plist` — `NSExtensionPointIdentifier = com.apple.widgetkit-extension`.
  The main app's `Fitfo/Info.plist` advertises `NSSupportsLiveActivities = YES`.

## Targets / build settings

- Extension bundle id: `<main bundle id>.FitFoLiveActivity`.
- Deployment target: **iOS 16.2** (Dynamic Island requires 16.2+; ActivityKit
  itself is 16.1+).
- `SKIP_INSTALL = YES`, `GENERATE_INFOPLIST_FILE = NO`, automatic signing.

## Re-wiring after `expo prebuild`

The widget extension target lives inside `Fitfo.xcodeproj/project.pbxproj`,
which Expo regenerates on `expo prebuild`. To re-register the target, either:

```bash
pnpm --dir apps/mobile run setup:live-activity
```

…or run the bundled Expo config plugin (`plugins/withFitFoLiveActivity.js`),
which Expo already invokes when prebuilding via `app.config.js`.

Both paths are idempotent and produce the same result.

After updating the project file, run `pod install` from `apps/mobile/ios/` and
rebuild a development client (Live Activities do not work in Expo Go — you need
a custom dev build / TestFlight binary).

## JS API

```ts
import { LiveWorkoutActivity } from "src/lib/liveWorkoutActivity";

await LiveWorkoutActivity.start({
  workoutName: "Push Day",
  exerciseName: "Bench Press",
  currentSet: 1,
  totalSets: 4,
  phase: "active",
});

await LiveWorkoutActivity.update({
  workoutName: "Push Day",
  exerciseName: "Bench Press",
  currentSet: 2,
  totalSets: 4,
  phase: "rest",
  restEndAt: new Date(Date.now() + 90_000),
  nextSet: 2,
});

await LiveWorkoutActivity.end();
```

All methods are safe to call on Android and on iOS < 16.2 — they resolve to
`{ ok: false, reason }` instead of throwing.
