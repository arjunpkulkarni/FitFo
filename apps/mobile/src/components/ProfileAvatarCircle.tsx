import { Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type IoniconsName = keyof typeof Ionicons.glyphMap;

type ProfileAvatarCircleProps = {
  /** Public HTTPS URL; optional cache-bust query appended when `revision` is set. */
  uri?: string | null;
  /** Typical value: profile `updated_at` so replacements reload without stale cache. */
  revision?: string | null;
  diameter: number;
  /** When empty `uri`: show initials (e.g. "AJ"). */
  fallbackInitials?: string;
  fallbackIcon?: IoniconsName;
  fallbackIconColor?: string;
  initialsColor?: string;
  initialsBackgroundColor?: string;
  iconBackgroundColor?: string;
};

function buildImageUri(uri: string, revision: string | null | undefined): string {
  const r = revision?.trim();
  if (!r) {
    return uri;
  }
  const sep = uri.includes("?") ? "&" : "?";
  return `${uri}${sep}v=${encodeURIComponent(r)}`;
}

export function ProfileAvatarCircle({
  uri,
  revision,
  diameter,
  fallbackInitials,
  fallbackIcon = "person-outline",
  fallbackIconColor = "#8E8E93",
  initialsColor = "#111111",
  initialsBackgroundColor = "#F2F2F7",
  iconBackgroundColor = "#F2F2F7",
}: ProfileAvatarCircleProps) {
  const radius = diameter / 2;
  const trimmedUri = uri?.trim() || "";

  return (
    <View
      style={[
        styles.clip,
        {
          width: diameter,
          height: diameter,
          borderRadius: radius,
        },
      ]}
    >
      {trimmedUri ? (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={{ uri: buildImageUri(trimmedUri, revision) }}
          style={{
            width: diameter,
            height: diameter,
            borderRadius: radius,
          }}
        />
      ) : fallbackInitials?.trim() ? (
        <View
          style={[
            styles.fallbackInner,
            {
              width: diameter,
              height: diameter,
              borderRadius: radius,
              backgroundColor: initialsBackgroundColor,
            },
          ]}
        >
          <Text style={[styles.initials, { color: initialsColor }]}>
            {fallbackInitials.trim().slice(0, 2).toUpperCase()}
          </Text>
        </View>
      ) : (
        <View
          style={[
            styles.fallbackInner,
            {
              width: diameter,
              height: diameter,
              borderRadius: radius,
              backgroundColor: iconBackgroundColor,
            },
          ]}
        >
          <Ionicons color={fallbackIconColor} name={fallbackIcon} size={radius * 0.9} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
  },
  fallbackInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontFamily: "Satoshi-Bold",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: -0.3,
  },
});
