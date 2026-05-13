const universalLinkHost =
  process.env.APP_UNIVERSAL_LINK_HOST ?? "www.fitfo.app";

export default {
  expo: {
    name: "Fitfo",
    slug: "fitfo-mobile",
    version: "1.0.6",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "fitfo",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    splash: {
      image: "./assets/icon.png",
      resizeMode: "contain",
      backgroundColor: "#000000",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.fitfo.mobile",
      buildNumber: "21",
      icon: "./assets/icon.png",
      usesAppleSignIn: true,
      associatedDomains: [`applinks:${universalLinkHost}`],
      infoPlist: {
        LSApplicationQueriesSchemes: ["instagram", "tiktok", "snssdk1180"],
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#F4F1EC",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "com.fitfo.mobile",
      versionCode: 1,
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: universalLinkHost,
              pathPrefix: "/app",
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "expo-video",
      [
        "expo-share-intent",
        {
          iosActivationRules: {
            NSExtensionActivationSupportsWebURLWithMaxCount: 1,
            NSExtensionActivationSupportsWebPageWithMaxCount: 1,
            NSExtensionActivationSupportsText: true,
            NSExtensionActivationDictionaryVersion: 2,
          },
          iosShareExtensionName: "fit fo Share",
          iosShareExtensionBundleIdentifier: "com.fitfo.mobile.fitfoShare",
          androidIntentFilters: ["text/*"],
          scheme: "fitfo",
        },
      ],
      "./plugins/withIosShareExtensionManualInfoPlist.js",
    ],
    extra: {
      posthogProjectToken: process.env.POSTHOG_PROJECT_TOKEN,
      posthogHost: process.env.POSTHOG_HOST,
      revenueCatAppleApiKey:
        process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY ||
        process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ||
        process.env.EXPO_PUBLIC_RC_API_KEY,
      revenueCatGoogleApiKey: process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY,
      disableAppleSearchAdsAttribution:
        process.env.EXPO_PUBLIC_DISABLE_APPLE_SEARCH_ADS_ATTRIBUTION === "1",
      eas: {
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
      },
    },
  },
};
