/**
 * Expo config plugin that keeps the FitFo Live Activity / Widget extension wired
 * into the iOS project whenever `expo prebuild` regenerates the native folder.
 *
 * It defers the heavy Xcode work to `scripts/setup-live-activity.js` so the
 * exact same code paths run during prebuild and from `pnpm run setup:live-activity`.
 * It also makes sure the host Info.plist advertises Live Activity support.
 */
const path = require("path");
const { withInfoPlist, withXcodeProject } = require("@expo/config-plugins");

function withLiveActivityInfoPlist(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.NSSupportsLiveActivities = true;
    cfg.modResults.NSSupportsLiveActivitiesFrequentUpdates = true;
    return cfg;
  });
}

function withLiveActivityXcodeTarget(config) {
  return withXcodeProject(config, (cfg) => {
    // Reuse the standalone script so we have one source of truth for the
    // pbxproj edits. The script writes the file back itself; we just trigger
    // it after Expo finishes the rest of its iOS mods.
    const scriptPath = path.join(__dirname, "..", "scripts", "setup-live-activity.js");
    try {
      // require() runs the script which performs idempotent edits.
      delete require.cache[require.resolve(scriptPath)];
      require(scriptPath);
    } catch (error) {
      console.warn(
        "[withFitFoLiveActivity] Failed to register widget target via setup script:",
        error,
      );
    }
    return cfg;
  });
}

module.exports = function withFitFoLiveActivity(config) {
  config = withLiveActivityInfoPlist(config);
  config = withLiveActivityXcodeTarget(config);
  return config;
};
