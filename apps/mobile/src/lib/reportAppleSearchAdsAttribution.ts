import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import type PostHog from "posthog-react-native";
import { getAttributionTokenAsync } from "expo-apple-search-ads";

import { isPostHogEnabled } from "./posthog";

const STORAGE_DONE_KEY = "@fitfo/apple-search-ads-checked-v1";
const ASA_API = "https://api-adservices.apple.com/api/v1/";
const ASA_RETRY_DELAY_MS = 5000;
const ASA_MAX_ATTEMPTS = 3;

type AppleAdsPayload = Record<string, unknown>;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isTruthyRecord(v: unknown): v is AppleAdsPayload {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

async function fetchAttribution(token: string): Promise<AppleAdsPayload | null> {
  const shouldRetryStatus = (s: number) => s === 404 || s === 500 || s === 502 || s === 503;

  for (let attempt = 0; attempt < ASA_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(ASA_API, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: token,
    });

    if (res.status === 200) {
      try {
        const json: unknown = await res.json();
        return isTruthyRecord(json) ? json : null;
      } catch {
        return null;
      }
    }

    if (attempt < ASA_MAX_ATTEMPTS - 1 && shouldRetryStatus(res.status)) {
      await sleep(ASA_RETRY_DELAY_MS);
      continue;
    }

    break;
  }
  return null;
}

/** One install-time check: ASA token → Apple API → coarse PostHog event. */
export async function reportAppleSearchAdsAttribution(
  client: PostHog,
): Promise<void> {
  try {
    if (Platform.OS !== "ios") {
      return;
    }

    const extra =
      Constants.expoConfig?.extra &&
      typeof Constants.expoConfig.extra === "object"
        ? (Constants.expoConfig.extra as Record<string, unknown>)
        : {};

    if (extra.disableAppleSearchAdsAttribution === true) {
      return;
    }

    if (__DEV__) {
      const inDevEnabled =
        process.env.EXPO_PUBLIC_APPLE_SEARCH_ADS_IN_DEV === "1";
      if (!inDevEnabled) {
        return;
      }
    }

    if (!isPostHogEnabled) {
      return;
    }

    const already = await AsyncStorage.getItem(STORAGE_DONE_KEY);
    if (already === "1") {
      return;
    }

    const token = await getAttributionTokenAsync();
    if (!token || token.length < 16) {
      await AsyncStorage.setItem(STORAGE_DONE_KEY, "1");
      return;
    }

    const payload = await fetchAttribution(token);
    if (!payload) {
      return;
    }

    const attributionFlag = payload.attribution === true;
    const summary: Record<string, string | number | boolean> = {
      attribution: attributionFlag,
    };
    const ct = str(payload.conversionType);
    const clt = str(payload.claimType);
    const sp = str(payload.supplyPlacement);
    const cor = str(payload.countryOrRegion);
    if (ct !== undefined) {
      summary.conversion_type = ct;
    }
    if (clt !== undefined) {
      summary.claim_type = clt;
    }
    if (sp !== undefined) {
      summary.supply_placement = sp;
    }
    if (cor !== undefined) {
      summary.country_or_region = cor;
    }
    const camp = num(payload.campaignId);
    const ag = num(payload.adGroupId);
    const kw = num(payload.keywordId);
    const ad = num(payload.adId);
    const org = num(payload.orgId);
    const click = str(payload.clickDate);
    const imp = str(payload.impressionDate);
    if (camp !== undefined) {
      summary.campaign_id = camp;
    }
    if (ag !== undefined) {
      summary.ad_group_id = ag;
    }
    if (kw !== undefined) {
      summary.keyword_id = kw;
    }
    if (ad !== undefined) {
      summary.ad_id = ad;
    }
    if (org !== undefined) {
      summary.org_id = org;
    }
    if (click !== undefined) {
      summary.click_date = click;
    }
    if (imp !== undefined) {
      summary.impression_date = imp;
    }

    client.capture("apple_search_ads_install_attribution", summary);
    await AsyncStorage.setItem(STORAGE_DONE_KEY, "1");
  } catch {
    /* non-fatal; retry on next cold start unless we persisted done */
  }
}
