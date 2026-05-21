import Foundation
import React

#if canImport(ActivityKit)
import ActivityKit
#endif

/// React Native bridge for Fitfo's Live Activity.
///
/// Exposes three methods to JS:
///   - `start(payload)`    — request a new ActivityKit activity for the current workout.
///   - `update(payload)`   — push an updated `ContentState` (exercise / set / rest).
///   - `end()`             — dismiss the currently tracked activity.
///
/// The active activity ID is held in-process so updates always target the activity we started.
/// On iOS < 16.2, on devices where Live Activities are disabled, or when the OS denies the
/// request, all methods resolve gracefully as no-ops (`{ ok: false, reason }`).
@objc(LiveWorkoutActivityModule)
final class LiveWorkoutActivityModule: NSObject {

  // The widget extension is iOS 16.2+, so we never store anything on older OSes.
  private var activeActivityID: String?

  @objc static func requiresMainQueueSetup() -> Bool { false }

  // MARK: - JS surface

  @objc(start:resolver:rejecter:)
  func start(
    _ payload: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      guard ActivityAuthorizationInfo().areActivitiesEnabled else {
        resolve(["ok": false, "reason": "live_activities_disabled"])
        return
      }

      let state = Self.parseState(payload)
      let attributes = FitFoWorkoutAttributes()
      let content = ActivityContent(state: state, staleDate: nil)

      // Re-use an existing activity for this app session — avoids stacking multiple Live
      // Activities if JS calls `start` again without first ending the previous one.
      if let existingID = activeActivityID,
         let existing = Activity<FitFoWorkoutAttributes>.activities.first(where: { $0.id == existingID }) {
        Task {
          await existing.update(content)
          resolve(["ok": true, "activityId": existing.id, "reused": true])
        }
        return
      }

      do {
        let activity = try Activity<FitFoWorkoutAttributes>.request(
          attributes: attributes,
          content: content,
          pushType: nil
        )
        activeActivityID = activity.id
        resolve(["ok": true, "activityId": activity.id, "reused": false])
      } catch {
        reject("live_activity_start_failed", error.localizedDescription, error)
      }
      return
    }
    #endif

    resolve(["ok": false, "reason": "unsupported_os"])
  }

  @objc(update:resolver:rejecter:)
  func update(
    _ payload: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      guard let activity = currentActivity() else {
        resolve(["ok": false, "reason": "no_active_activity"])
        return
      }

      let state = Self.parseState(payload)
      let content = ActivityContent(state: state, staleDate: nil)

      Task {
        await activity.update(content)
        resolve(["ok": true, "activityId": activity.id])
      }
      return
    }
    #endif

    resolve(["ok": false, "reason": "unsupported_os"])
  }

  @objc(end:rejecter:)
  func end(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      guard let activity = currentActivity() else {
        activeActivityID = nil
        resolve(["ok": false, "reason": "no_active_activity"])
        return
      }

      let dismissedID = activity.id
      activeActivityID = nil

      Task {
        await activity.end(nil, dismissalPolicy: .immediate)
        resolve(["ok": true, "activityId": dismissedID])
      }
      return
    }
    #endif

    resolve(["ok": false, "reason": "unsupported_os"])
  }

  // MARK: - Helpers

  #if canImport(ActivityKit)
  @available(iOS 16.2, *)
  private func currentActivity() -> Activity<FitFoWorkoutAttributes>? {
    if let id = activeActivityID,
       let match = Activity<FitFoWorkoutAttributes>.activities.first(where: { $0.id == id }) {
      return match
    }
    // Fall back to any in-flight activity owned by us (e.g. after an app relaunch).
    let fallback = Activity<FitFoWorkoutAttributes>.activities.first
    if let fallback = fallback {
      activeActivityID = fallback.id
    }
    return fallback
  }

  @available(iOS 16.2, *)
  private static func parseState(_ payload: NSDictionary) -> FitFoWorkoutAttributes.ContentState {
    let workoutName = (payload["workoutName"] as? String) ?? "Workout"
    let exerciseName = (payload["exerciseName"] as? String) ?? "Get ready"
    let currentSet = (payload["currentSet"] as? Int) ?? 1
    let totalSets = (payload["totalSets"] as? Int) ?? max(currentSet, 1)
    let phase = (payload["phase"] as? String) ?? "active"
    let nextSet = payload["nextSet"] as? Int

    var restEndAt: Date?
    // JS sends epoch ms; ObjC bridge surfaces as NSNumber or Double depending on the wrapper.
    if let ms = payload["restEndAtMs"] as? Double, ms > 0 {
      restEndAt = Date(timeIntervalSince1970: ms / 1000)
    } else if let n = payload["restEndAtMs"] as? NSNumber {
      let value = n.doubleValue
      if value > 0 {
        restEndAt = Date(timeIntervalSince1970: value / 1000)
      }
    }

    return FitFoWorkoutAttributes.ContentState(
      workoutName: workoutName,
      exerciseName: exerciseName,
      currentSet: currentSet,
      totalSets: totalSets,
      phase: phase,
      restEndAt: restEndAt,
      nextSet: nextSet
    )
  }
  #endif
}
