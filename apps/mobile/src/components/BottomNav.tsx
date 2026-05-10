import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";

import { getTheme, type ThemeMode } from "../theme";
import type { AppTab } from "../types";

interface BottomNavProps {
  activeTab: AppTab;
  onChangeTab: (tab: AppTab) => void;
  onImportWorkout: () => void;
  themeMode?: ThemeMode;
}

const tabs: Array<{
  key: AppTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    key: "saved",
    label: "Workouts",
    icon: "barbell-outline",
    activeIcon: "barbell",
  },
  {
    key: "logs",
    label: "Logs",
    icon: "bar-chart-outline",
    activeIcon: "bar-chart",
  },
];

export function BottomNav({
  activeTab,
  onChangeTab,
  onImportWorkout,
  themeMode = "light",
}: BottomNavProps) {
  const { width } = useWindowDimensions();
  const sideInset = Math.max(10, Math.min(30, Math.round(width * 0.065)));
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);
  const isDark = theme.mode === "dark";

  const inactiveColor = isDark
    ? "rgba(255, 255, 255, 0.55)"
    : "rgba(20, 25, 45, 0.55)";
  const activeLabelColor = isDark
    ? "#FFFFFF"
    : theme.colors.textPrimary;

  const renderTab = (tab: (typeof tabs)[number]) => {
    const isActive = tab.key === activeTab;
    return (
      <Pressable
        key={tab.key}
        onPress={() => onChangeTab(tab.key)}
        style={({ pressed }) => [
          styles.item,
          pressed ? styles.itemPressed : null,
        ]}
        hitSlop={6}
      >
        <View
          style={[
            styles.iconWrap,
            isActive ? styles.iconWrapActive : null,
          ]}
        >
          <Ionicons
            color={isActive ? "#FFFFFF" : inactiveColor}
            name={isActive ? tab.activeIcon : tab.icon}
            size={17}
          />
        </View>
        <Text
          style={[
            styles.label,
            { color: isActive ? activeLabelColor : inactiveColor },
            isActive ? styles.labelActive : null,
          ]}
          numberOfLines={1}
        >
          {tab.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      style={[styles.shell, { left: sideInset, right: sideInset }]}
      pointerEvents="box-none"
    >
      <BlurView
        intensity={Platform.OS === "ios" ? 70 : 90}
        tint={isDark ? "dark" : "light"}
        style={styles.blurContainer}
      >
        <View style={styles.glassTint} pointerEvents="none" />
        <View style={styles.row}>
          {renderTab(tabs[0])}

          <Pressable
            onPress={onImportWorkout}
            style={({ pressed }) => [
              styles.importButton,
              pressed ? styles.importButtonPressed : null,
            ]}
            hitSlop={6}
          >
            <Ionicons color="#FFFFFF" name="add" size={24} />
          </Pressable>

          {renderTab(tabs[1])}
        </View>
      </BlurView>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) => {
  const isDark = theme.mode === "dark";
  return StyleSheet.create({
    shell: {
      position: "absolute",
      bottom: 18,
      borderRadius: 999,
      overflow: "hidden",
      backgroundColor: "transparent",
      shadowColor: "#000000",
      shadowOpacity: isDark ? 0.4 : 0.16,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 12,
    },
    blurContainer: {
      borderRadius: 999,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark
        ? "rgba(255, 130, 80, 0.32)"
        : "rgba(71, 88, 240, 0.28)",
    },
    glassTint: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark
        ? "rgba(255, 115, 50, 0.18)"
        : "rgba(71, 88, 240, 0.12)",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 10,
    },
    item: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
      borderRadius: 999,
      paddingVertical: 4,
      marginHorizontal: 2,
    },
    itemPressed: {
      opacity: 0.7,
      transform: [{ scale: 0.97 }],
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    iconWrapActive: {
      backgroundColor: theme.colors.primaryBright,
      shadowColor: theme.colors.primaryBright,
      shadowOpacity: 0.55,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    importButton: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primaryBright,
      marginHorizontal: 8,
      shadowColor: theme.colors.primaryBright,
      shadowOpacity: 0.6,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 10,
    },
    importButtonPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.96 }],
    },
    label: {
      fontSize: 9,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
      letterSpacing: 0.7,
      textTransform: "uppercase",
    },
    labelActive: {
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
  });
};
