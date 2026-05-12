import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

type NativeModule = {
  getAttributionTokenAsync: () => Promise<string | null>;
};

let nativeModule: NativeModule | null = null;

function getNativeModule(): NativeModule | null {
  if (Platform.OS !== "ios") {
    return null;
  }
  if (nativeModule) {
    return nativeModule;
  }
  nativeModule = requireOptionalNativeModule<NativeModule>("ExpoAppleSearchAds");
  return nativeModule;
}

/** Base64 ASA token valid ~24h; POST to Apple's attribution API ASAP. */
export async function getAttributionTokenAsync(): Promise<string | null> {
  const mod = getNativeModule();
  if (!mod) {
    return null;
  }
  try {
    return await mod.getAttributionTokenAsync();
  } catch {
    return null;
  }
}
