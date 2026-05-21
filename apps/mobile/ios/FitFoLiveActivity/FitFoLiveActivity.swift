import Foundation
import SwiftUI

#if canImport(ActivityKit) && canImport(WidgetKit)
import ActivityKit
import WidgetKit

@available(iOS 16.2, *)
@main
struct FitFoLiveActivityBundle: WidgetBundle {
  var body: some Widget {
    FitFoWorkoutLiveActivity()
  }
}

@available(iOS 16.2, *)
struct FitFoWorkoutLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: FitFoWorkoutAttributes.self) { context in
      LockScreenView(state: context.state)
        .activityBackgroundTint(Color.black.opacity(0.85))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          ExpandedLeading(state: context.state)
        }
        DynamicIslandExpandedRegion(.trailing) {
          ExpandedTrailing(state: context.state)
        }
        DynamicIslandExpandedRegion(.bottom) {
          ExpandedBottom(state: context.state)
        }
      } compactLeading: {
        FitFoLogoMark(size: 18)
      } compactTrailing: {
        CompactTrailing(state: context.state)
      } minimal: {
        FitFoLogoMark(size: 18)
      }
      .keylineTint(.orange)
    }
  }
}

// MARK: - Brand mark

@available(iOS 16.2, *)
private struct FitFoLogoMark: View {
  let size: CGFloat

  var body: some View {
    Image("FitFoLogo")
      .resizable()
      .aspectRatio(contentMode: .fit)
      .frame(width: size, height: size)
  }
}

// MARK: - Lock Screen

@available(iOS 16.2, *)
private struct LockScreenView: View {
  let state: FitFoWorkoutAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 8) {
        FitFoLogoMark(size: 16)
        Text(state.workoutName)
          .font(.system(size: 13, weight: .semibold))
          .foregroundColor(.white.opacity(0.85))
          .lineLimit(1)
        Spacer(minLength: 0)
        SetPill(current: state.currentSet, total: state.totalSets)
      }

      Text(state.exerciseName)
        .font(.system(size: 20, weight: .bold))
        .foregroundColor(.white)
        .lineLimit(2)
        .minimumScaleFactor(0.85)

      if state.phase == "rest", let endsAt = state.restEndAt {
        RestCountdownBlock(endsAt: endsAt, nextSet: state.nextSet, totalSets: state.totalSets)
      } else {
        Text(callout(for: state))
          .font(.system(size: 13, weight: .medium))
          .foregroundColor(.white.opacity(0.7))
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 14)
  }
}

@available(iOS 16.2, *)
private struct RestCountdownBlock: View {
  let endsAt: Date
  let nextSet: Int?
  let totalSets: Int

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 10) {
      Text("Rest")
        .font(.system(size: 12, weight: .heavy))
        .foregroundColor(.orange)
        .textCase(.uppercase)

      Text(timerInterval: Date()...endsAt, countsDown: true)
        .font(.system(size: 26, weight: .heavy, design: .rounded))
        .monospacedDigit()
        .foregroundColor(.white)

      Spacer(minLength: 0)

      if let next = nextSet {
        Text("Next: Set \(next)/\(totalSets)")
          .font(.system(size: 12, weight: .semibold))
          .foregroundColor(.white.opacity(0.7))
      }
    }
  }
}

@available(iOS 16.2, *)
private struct SetPill: View {
  let current: Int
  let total: Int

  var body: some View {
    Text("Set \(max(current, 1))/\(max(total, current, 1))")
      .font(.system(size: 12, weight: .heavy))
      .foregroundColor(.black)
      .padding(.horizontal, 10)
      .padding(.vertical, 4)
      .background(Capsule().fill(Color.orange))
  }
}

// MARK: - Dynamic Island regions

@available(iOS 16.2, *)
private struct CompactTrailing: View {
  let state: FitFoWorkoutAttributes.ContentState

  var body: some View {
    if state.phase == "rest", let endsAt = state.restEndAt {
      Text(timerInterval: Date()...endsAt, countsDown: true)
        .monospacedDigit()
        .frame(width: 52)
        .foregroundColor(.orange)
        .font(.system(size: 13, weight: .heavy, design: .rounded))
    } else {
      Text("Set \(max(state.currentSet, 1))")
        .font(.system(size: 13, weight: .heavy))
        .foregroundColor(.orange)
    }
  }
}

@available(iOS 16.2, *)
private struct ExpandedLeading: View {
  let state: FitFoWorkoutAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("Exercise")
        .font(.system(size: 10, weight: .heavy))
        .foregroundColor(.white.opacity(0.6))
        .textCase(.uppercase)
      Text(state.exerciseName)
        .font(.system(size: 16, weight: .bold))
        .foregroundColor(.white)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }
    .padding(.leading, 4)
  }
}

@available(iOS 16.2, *)
private struct ExpandedTrailing: View {
  let state: FitFoWorkoutAttributes.ContentState

  var body: some View {
    VStack(alignment: .trailing, spacing: 2) {
      Text("Set")
        .font(.system(size: 10, weight: .heavy))
        .foregroundColor(.white.opacity(0.6))
        .textCase(.uppercase)
      Text("\(max(state.currentSet, 1))/\(max(state.totalSets, state.currentSet, 1))")
        .font(.system(size: 18, weight: .heavy, design: .rounded))
        .foregroundColor(.orange)
        .monospacedDigit()
    }
    .padding(.trailing, 4)
  }
}

@available(iOS 16.2, *)
private struct ExpandedBottom: View {
  let state: FitFoWorkoutAttributes.ContentState

  var body: some View {
    if state.phase == "rest", let endsAt = state.restEndAt {
      HStack(spacing: 10) {
        Text("Rest")
          .font(.system(size: 12, weight: .heavy))
          .foregroundColor(.orange)
          .textCase(.uppercase)
        Text(timerInterval: Date()...endsAt, countsDown: true)
          .font(.system(size: 22, weight: .heavy, design: .rounded))
          .monospacedDigit()
          .foregroundColor(.white)
        Spacer()
        if let next = state.nextSet {
          Text("Next: Set \(next)")
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(.white.opacity(0.65))
        }
      }
      .padding(.horizontal, 4)
    } else {
      HStack(spacing: 8) {
        Image(systemName: "arrow.up.right.circle.fill")
          .foregroundColor(.orange)
        Text("Log your set in Fitfo.")
          .font(.system(size: 13, weight: .semibold))
          .foregroundColor(.white.opacity(0.85))
      }
      .padding(.horizontal, 4)
    }
  }
}

private func callout(for state: FitFoWorkoutAttributes.ContentState) -> String {
  switch state.phase {
  case "ready":
    return "Get ready for set \(max(state.currentSet, 1))."
  default:
    return "Log your set in Fitfo to start the rest timer."
  }
}
#endif
