import Foundation

#if canImport(ActivityKit)
import ActivityKit

/// Mirror of the widget extension's `FitFoWorkoutAttributes`, compiled into the host app
/// so the React Native module can `Activity<FitFoWorkoutAttributes>.request(...)` against
/// the same type the extension renders. Keep both definitions byte-for-byte in sync.
@available(iOS 16.2, *)
public struct FitFoWorkoutAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var workoutName: String
    public var exerciseName: String
    public var currentSet: Int
    public var totalSets: Int
    public var phase: String
    public var restEndAt: Date?
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
