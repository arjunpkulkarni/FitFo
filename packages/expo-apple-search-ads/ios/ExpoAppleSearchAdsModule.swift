import AdServices
import ExpoModulesCore

public class ExpoAppleSearchAdsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoAppleSearchAds")

    AsyncFunction("getAttributionTokenAsync") { () -> String? in
      guard #available(iOS 14.3, *) else {
        return nil
      }

      do {
        return try AAAttribution.attributionToken()
      } catch {
        return nil
      }
    }
  }
}
