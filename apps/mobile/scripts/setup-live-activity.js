#!/usr/bin/env node
/**
 * Idempotent Xcode setup for the FitFo Live Activity / Widget extension.
 *
 * What this does:
 *  1. Adds the native module sources under `ios/Fitfo/LiveWorkoutActivity/` to the
 *     main `Fitfo` target so the RN bridge compiles.
 *  2. Registers a new `FitFoLiveActivity` Widget Extension target with the matching
 *     bundle id (`<main bundle>.FitFoLiveActivity`) using the same team / signing
 *     style as the host app, deployment target 16.2. The xcode helper also creates
 *     the Embed App Extensions copy phase + target dependency on the main app.
 *  3. Re-running the script is safe — every step short-circuits if the relevant
 *     references already exist.
 *
 * Run it after pulling these changes:
 *   pnpm --dir apps/mobile run setup:live-activity
 *
 * Then `pod install` from `apps/mobile/ios/` and rebuild a dev client.
 */
const fs = require("fs");
const path = require("path");
const xcode = require("xcode");

const IOS_DIR = path.resolve(__dirname, "..", "ios");
const PROJECT_PATH = path.join(IOS_DIR, "Fitfo.xcodeproj", "project.pbxproj");
const MAIN_TARGET_NAME = "Fitfo";
const WIDGET_TARGET_NAME = "FitFoLiveActivity";
const WIDGET_DIR_NAME = "FitFoLiveActivity";
const WIDGET_GROUP_PATH = "FitFoLiveActivity";

const HOST_MODULE_DIR = "LiveWorkoutActivity"; // ios/Fitfo/LiveWorkoutActivity
const HOST_MODULE_SOURCES = [
  "FitFoWorkoutAttributesShared.swift",
  "LiveWorkoutActivityModule.swift",
  "LiveWorkoutActivityModule.m",
];

const WIDGET_SOURCES = ["FitFoWorkoutAttributes.swift", "FitFoLiveActivity.swift"];
const WIDGET_INFO_PLIST = "Info.plist";

const DEPLOYMENT_TARGET = "16.2";
const WIDGET_BUNDLE_SUFFIX = "FitFoLiveActivity";

function log(msg) {
  console.log(`[setup-live-activity] ${msg}`);
}

function unquote(value) {
  return String(value || "").replace(/(^"|"$)/g, "");
}

function getMainBundleIdentifier(project) {
  const configurations = project.pbxXCBuildConfigurationSection();
  for (const entry of Object.values(configurations)) {
    if (!entry || typeof entry !== "object" || !entry.buildSettings) continue;
    if (unquote(entry.buildSettings.PRODUCT_NAME) !== MAIN_TARGET_NAME) continue;
    if (entry.buildSettings.PRODUCT_BUNDLE_IDENTIFIER) {
      return unquote(entry.buildSettings.PRODUCT_BUNDLE_IDENTIFIER);
    }
  }
  return "com.fitfo.mobile";
}

function getDevelopmentTeam(project) {
  const configurations = project.pbxXCBuildConfigurationSection();
  for (const entry of Object.values(configurations)) {
    if (!entry || typeof entry !== "object" || !entry.buildSettings) continue;
    if (unquote(entry.buildSettings.PRODUCT_NAME) !== MAIN_TARGET_NAME) continue;
    if (entry.buildSettings.DEVELOPMENT_TEAM) {
      return unquote(entry.buildSettings.DEVELOPMENT_TEAM);
    }
  }
  return null;
}

function findTargetByName(project, name) {
  const targets = project.pbxNativeTargetSection();
  for (const [key, entry] of Object.entries(targets)) {
    if (key.endsWith("_comment") || typeof entry !== "object" || !entry) continue;
    if (unquote(entry.name) === name) {
      return { uuid: key, target: entry };
    }
  }
  return null;
}

function findGroupByName(project, name) {
  const groups = project.hash.project.objects.PBXGroup || {};
  for (const [key, entry] of Object.entries(groups)) {
    if (key.endsWith("_comment") || !entry || typeof entry !== "object") continue;
    const entryName = unquote(entry.name || entry.path || "");
    if (entryName === name) {
      return { uuid: key, group: entry };
    }
  }
  return null;
}

function fileAlreadyInGroup(project, groupUuid, fileName) {
  const group = project.hash.project.objects.PBXGroup[groupUuid];
  if (!group || !Array.isArray(group.children)) return false;
  const fileRefs = project.hash.project.objects.PBXFileReference || {};
  return group.children.some((child) => {
    const ref = fileRefs[child.value];
    if (!ref) return false;
    return unquote(ref.name || ref.path) === fileName;
  });
}

function ensureChildGroup(project, parentUuid, name, relativePath) {
  let existing = findGroupByName(project, name);
  if (existing) return existing;

  const uuid = project.pbxCreateGroup(name, relativePath);
  const parent = project.hash.project.objects.PBXGroup[parentUuid];
  parent.children = parent.children || [];
  if (!parent.children.find((c) => c.value === uuid)) {
    parent.children.push({ value: uuid, comment: name });
  }
  log(`Created group ${relativePath}`);
  return { uuid, group: project.hash.project.objects.PBXGroup[uuid] };
}

function addHostModuleSources(project) {
  const fitfoGroup = findGroupByName(project, "Fitfo");
  if (!fitfoGroup) {
    throw new Error("Could not locate the main `Fitfo` group in the Xcode project.");
  }

  const mainTarget = findTargetByName(project, MAIN_TARGET_NAME);
  if (!mainTarget) {
    throw new Error("Could not locate the main `Fitfo` target.");
  }

  const subGroup = ensureChildGroup(
    project,
    fitfoGroup.uuid,
    HOST_MODULE_DIR,
    `Fitfo/${HOST_MODULE_DIR}`,
  );

  for (const fileName of HOST_MODULE_SOURCES) {
    if (fileAlreadyInGroup(project, subGroup.uuid, fileName)) {
      log(`Skip ${fileName} (already in project).`);
      continue;
    }
    project.addSourceFile(
      `Fitfo/${HOST_MODULE_DIR}/${fileName}`,
      { target: mainTarget.uuid },
      subGroup.uuid,
    );
    log(`Added Fitfo/${HOST_MODULE_DIR}/${fileName} to ${MAIN_TARGET_NAME}.`);
  }
}

function ensureWidgetGroup(project) {
  const mainGroupUuid = project.getFirstProject().firstProject.mainGroup;
  return ensureChildGroup(project, mainGroupUuid, WIDGET_GROUP_PATH, WIDGET_GROUP_PATH);
}

function applyWidgetBuildSettings(project, target, mainBundleId, devTeam) {
  const lookup = project.pbxXCConfigurationList();
  const configList = lookup[target.buildConfigurationList];
  const configIds = (configList && configList.buildConfigurations) || [];
  const allConfigs = project.pbxXCBuildConfigurationSection();
  for (const ref of configIds) {
    const cfg = allConfigs[ref.value];
    if (!cfg || !cfg.buildSettings) continue;
    cfg.buildSettings.INFOPLIST_FILE = `"${WIDGET_DIR_NAME}/Info.plist"`;
    cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = DEPLOYMENT_TARGET;
    cfg.buildSettings.SWIFT_VERSION = "5.0";
    cfg.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
    cfg.buildSettings.PRODUCT_NAME = `"${WIDGET_TARGET_NAME}"`;
    cfg.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${mainBundleId}.${WIDGET_BUNDLE_SUFFIX}"`;
    cfg.buildSettings.GENERATE_INFOPLIST_FILE = "NO";
    cfg.buildSettings.CODE_SIGN_STYLE = "Automatic";
    cfg.buildSettings.SKIP_INSTALL = "YES";
    cfg.buildSettings.MARKETING_VERSION = "1.0";
    cfg.buildSettings.CURRENT_PROJECT_VERSION = "1";
    cfg.buildSettings.CLANG_ENABLE_MODULES = "YES";
    cfg.buildSettings.SWIFT_EMIT_LOC_STRINGS = "YES";
    if (devTeam) {
      cfg.buildSettings.DEVELOPMENT_TEAM = devTeam;
    }
  }
}

function ensureWidgetTarget(project, mainBundleId, devTeam) {
  const existing = findTargetByName(project, WIDGET_TARGET_NAME);
  if (existing) {
    log(`Widget target already registered (${existing.uuid}).`);
    applyWidgetBuildSettings(project, existing.target, mainBundleId, devTeam);
    return existing;
  }

  const widgetGroup = ensureWidgetGroup(project);

  const targetResult = project.addTarget(
    WIDGET_TARGET_NAME,
    "app_extension",
    WIDGET_TARGET_NAME,
    `${mainBundleId}.${WIDGET_BUNDLE_SUFFIX}`,
  );
  const widgetTarget = { uuid: targetResult.uuid, target: targetResult.pbxNativeTarget };

  // Build phases — addBuildPhase mutates the project in place.
  project.addBuildPhase([], "PBXSourcesBuildPhase", "Sources", widgetTarget.uuid);
  project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", widgetTarget.uuid);
  project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", widgetTarget.uuid);

  for (const fileName of WIDGET_SOURCES) {
    if (fileAlreadyInGroup(project, widgetGroup.uuid, fileName)) continue;
    project.addSourceFile(
      `${WIDGET_DIR_NAME}/${fileName}`,
      { target: widgetTarget.uuid },
      widgetGroup.uuid,
    );
  }

  if (!fileAlreadyInGroup(project, widgetGroup.uuid, WIDGET_INFO_PLIST)) {
    project.addFile(`${WIDGET_DIR_NAME}/${WIDGET_INFO_PLIST}`, widgetGroup.uuid, {
      lastKnownFileType: "text.plist.xml",
    });
  }

  applyWidgetBuildSettings(project, widgetTarget.target, mainBundleId, devTeam);

  log(`Registered widget target ${WIDGET_TARGET_NAME} (${widgetTarget.uuid}).`);
  return widgetTarget;
}

function main() {
  if (!fs.existsSync(PROJECT_PATH)) {
    console.error(`Could not find pbxproj at ${PROJECT_PATH}.`);
    process.exit(1);
  }

  const project = xcode.project(PROJECT_PATH);
  project.parseSync();

  const mainBundleId = getMainBundleIdentifier(project);
  const devTeam = getDevelopmentTeam(project);
  log(`Main bundle id: ${mainBundleId}`);
  if (devTeam) log(`Development team: ${devTeam}`);

  addHostModuleSources(project);
  ensureWidgetTarget(project, mainBundleId, devTeam);

  fs.writeFileSync(PROJECT_PATH, project.writeSync());
  log("Updated project.pbxproj. Run `cd apps/mobile/ios && pod install` next.");
}

if (require.main === module) {
  main();
} else {
  module.exports = main;
}
