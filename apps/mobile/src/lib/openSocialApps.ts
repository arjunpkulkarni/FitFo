import { Linking } from "react-native";

const INSTAGRAM_APP = "instagram://app";
const INSTAGRAM_WEB = "https://www.instagram.com/";
const TIKTOK_APP_URLS = ["tiktok://", "snssdk1180://"];
const TIKTOK_WEB = "https://www.tiktok.com/";

async function openUrl(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Opens the Instagram app when installed; otherwise opens instagram.com. */
export async function openInstagramApp(): Promise<void> {
  if (!(await openUrl(INSTAGRAM_APP))) {
    await openUrl(INSTAGRAM_WEB);
  }
}

/** Opens the TikTok app when installed; otherwise opens tiktok.com. */
export async function openTikTokApp(): Promise<void> {
  for (const scheme of TIKTOK_APP_URLS) {
    if (await openUrl(scheme)) {
      return;
    }
  }
  await openUrl(TIKTOK_WEB);
}
