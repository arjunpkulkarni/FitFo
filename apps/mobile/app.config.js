export default {
  expo: {
    name: "Fitfo",
    slug: "fitfo-mobile",
    version: "1.0.3",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "fitfo",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    splash: {
      image: "./assets/logo.png",
      resizeMode: "contain",
      backgroundColor: "#000000",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.fitfo.mobile",
      buildNumber: "20",
      icon: "./assets/icon.png",
      usesAppleSignIn: true,
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
            NSExtensionActivationSupportsText: 1,
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
      eas: {
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
      },
    },
  },
};
