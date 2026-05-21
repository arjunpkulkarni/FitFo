import Foundation

#if canImport(ActivityKit)
import ActivityKit

/// ActivityKit payload shared between the host app and the Fitfo Live Activity widget.
///
/// `ContentState` is the only piece that can be updated after the activity starts;
/// the outer struct (workout name, etc.) is fixed for the lifetime of the activity.
@available(iOS 16.2, *)
public struct FitFoWorkoutAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// Title shown next to the Fitfo brand mark (e.g. "Push Day").
    public var workoutName: String
    /// Exercise currently being performed.
    public var exerciseName: String
    /// 1-based current set index.
    public var currentSet: Int
    /// Total sets planned for the current exercise.
    public var totalSets: Int
    /// One of `"active" | "rest" | "ready"`. Strings keep parity with the JS payload.
    public var phase: String
    /// Wall-clock time when the rest countdown finishes. Required when `phase == "rest"`.
    public var restEndAt: Date?
    /// Optional next set index, surfaced after the current set is logged.
    public var nextSet: Int?

    public init(
      workoutName: String,
      exerciseName: String,
      currentSet: Int,
      totalSets: Int,
      phase: String,
      restEndAt: Date? = nil,
      nextSet: Int? = nil
    ) {
      self.workoutName = workoutName
      self.exerciseName = exerciseName
      self.currentSet = currentSet
      self.totalSets = totalSets
      self.phase = phase
      self.restEndAt = restEndAt
      self.nextSet = nextSet
    }
  }

  public init() {}
}
#endif
