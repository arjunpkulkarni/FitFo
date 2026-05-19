import { Alert, Linking } from "react-native";

export function openFeatureSuggestion(
  capture?: (event: string) => void,
): void {
  const subject = encodeURIComponent("Fitfo feature suggestion");
  const body = encodeURIComponent(
    [
      "Tell us what would make Fitfo better for you.",
      "",
      "Feature idea:",
      "",
      "Why it would help:",
      "",
    ].join("\n"),
  );
  const mailto = `mailto:suggestions@fitfo.app?subject=${subject}&body=${body}`;

  capture?.("feature_suggestion_opened");
  Linking.openURL(mailto).catch(() => {
    Alert.alert(
      "Email unavailable",
      "Send your feature ideas to suggestions@fitfo.app and we'll use them to improve Fitfo.",
    );
  });
}
