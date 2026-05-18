import * as Application from "expo-application";
import * as Device from "expo-device";
import * as Localization from "expo-localization";
import type { PostHog } from "posthog-react-native";

type PostHogCaptureProps = NonNullable<Parameters<PostHog["capture"]>[1]>;

/**
 * Shared dimensions for PostHog breakdowns (country, device, app version).
 * Person properties may still override; this keeps event-level context consistent.
 */
export function getCommonAnalyticsProperties(): Record<
  string,
  string | number | boolean
> {
  const locales = Localization.getLocales();
  const loc = locales[0];
  return omitUndefined({
    app_version: Application.nativeApplicationVersion ?? undefined,
    app_build: Application.nativeBuildVersion ?? undefined,
    os_version: Device.osVersion ?? undefined,
    device_model: Device.modelName ?? Device.modelId ?? undefined,
    user_country: loc?.regionCode ?? undefined,
    locale: loc?.languageTag ?? undefined,
  });
}

function omitUndefined(
  record: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

export function safeMergeContext(
  extra?: Record<string, unknown> | null,
): Record<string, unknown> {
  return {
    ...getCommonAnalyticsProperties(),
    ...(extra ?? {}),
  };
}

export function captureProduct(
  client: PostHog,
  event: string,
  properties?: Record<string, unknown>,
): void {
  try {
    client.capture(event, safeMergeContext(properties) as PostHogCaptureProps);
  } catch {
    // PostHog disabled or transient failure — never block UX.
  }
}
