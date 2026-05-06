import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { getTheme, type ThemeMode } from "../theme";

export type CoachmarkRect = { x: number; y: number; width: number; height: number };

export type CoachmarkPlacement = "auto" | "topBanner";

type LayerBounds = CoachmarkRect;

/**
 * Inline overlay (not Modal) so touches pass through the highlighted “hole” to
 * underlying buttons and lists. Dim regions block interaction outside the hole.
 */
export function SavedWorkoutsCoachmark({
  body,
  onTargetPress,
  placement = "auto",
  rect,
  themeMode = "dark",
  title,
  visible,
}: {
  body: string;
  onTargetPress?: () => void;
  placement?: CoachmarkPlacement;
  rect: CoachmarkRect | null;
  themeMode?: ThemeMode;
  title: string;
  visible: boolean;
}) {
  const theme = getTheme(themeMode);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const layerRef = useRef<View | null>(null);
  const [layerBounds, setLayerBounds] = useState<LayerBounds | null>(null);

  const reportLayerBounds = useCallback(() => {
    layerRef.current?.measureInWindow?.((x, y, width, height) => {
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height)
      ) {
        setLayerBounds(null);
        return;
      }
      setLayerBounds((current) => {
        if (
          current &&
          current.x === x &&
          current.y === y &&
          current.width === width &&
          current.height === height
        ) {
          return current;
        }
        return { x, y, width, height };
      });
    });
  }, []);

  useEffect(() => {
    if (!visible) {
      setLayerBounds(null);
      return undefined;
    }
    const frame = requestAnimationFrame(reportLayerBounds);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [reportLayerBounds, visible, windowHeight, windowWidth]);

  if (!visible) {
    return null;
  }

  if (rect && !layerBounds) {
    return (
      <View
        ref={(node) => {
          layerRef.current = node;
        }}
        onLayout={reportLayerBounds}
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, styles.layer]}
      />
    );
  }

  const overlayWidth = layerBounds?.width ?? windowWidth;
  const overlayHeight = layerBounds?.height ?? windowHeight;
  const localRect =
    rect && layerBounds
      ? {
          x: rect.x - layerBounds.x,
          y: rect.y - layerBounds.y,
          width: rect.width,
          height: rect.height,
        }
      : rect;

  const hole = localRect
    ? {
        x: Math.max(localRect.x - 6, 8),
        y: Math.max(localRect.y - 6, 8),
        width: Math.max(localRect.width + 12, 20),
        height: Math.max(localRect.height + 12, 20),
      }
    : null;

  const calloutWidth = placement === "topBanner" ? Math.min(overlayWidth - 32, 340) : 260;

  let calloutLeft = 16;
  let calloutTop = 220;
  let showArrow = true;
  /** "below" → arrow on TOP of callout pointing up at hole; "above" → arrow on BOTTOM pointing down at hole. */
  let arrowSide: "above" | "below" = "below";
  let arrowOffsetX = calloutWidth / 2 - 9;

  const SIDE_MARGIN = 16;
  const GAP_FROM_HOLE = 16;

  if (hole) {
    const holeCenterX = hole.x + hole.width / 2;
    const desiredLeft = holeCenterX - calloutWidth / 2;
    calloutLeft = Math.max(
      SIDE_MARGIN,
      Math.min(desiredLeft, overlayWidth - calloutWidth - SIDE_MARGIN),
    );
    arrowOffsetX = Math.max(
      18,
      Math.min(holeCenterX - calloutLeft - 9, calloutWidth - 18 - 18),
    );

    const spaceBelow = overlayHeight - (hole.y + hole.height);
    const wantAbove = placement === "topBanner" || spaceBelow < 200;

    if (wantAbove) {
      arrowSide = "above";
      const calloutHeightEstimate = 130;
      calloutTop = Math.max(
        24,
        hole.y - GAP_FROM_HOLE - calloutHeightEstimate,
      );
    } else {
      arrowSide = "below";
      calloutTop = hole.y + hole.height + GAP_FROM_HOLE;
    }
  } else {
    calloutLeft = Math.max(SIDE_MARGIN, (overlayWidth - calloutWidth) / 2);
    calloutTop = Math.max(120, overlayHeight * 0.28);
    showArrow = false;
  }

  const block = () => {};
  const dimQuads =
    hole != null ? (
      <>
        <Pressable
          onPress={block}
          style={[styles.dim, { top: 0, left: 0, right: 0, height: hole.y }]}
        />
        <Pressable
          onPress={block}
          style={[
            styles.dim,
            { top: hole.y, left: 0, width: hole.x, height: hole.height },
          ]}
        />
        <Pressable
          onPress={block}
          style={[
            styles.dim,
            {
              top: hole.y,
              left: hole.x + hole.width,
              right: 0,
              height: hole.height,
            },
          ]}
        />
        <Pressable
          onPress={block}
          style={[
            styles.dim,
            { top: hole.y + hole.height, left: 0, right: 0, bottom: 0 },
          ]}
        />
      </>
    ) : (
      <Pressable onPress={block} style={[styles.dim, StyleSheet.absoluteFillObject]} />
    );

  return (
    <View
      ref={(node) => {
        layerRef.current = node;
      }}
      onLayout={reportLayerBounds}
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFillObject, styles.layer]}
      accessibilityViewIsModal
    >
      <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
        {dimQuads}
      </View>

      {hole ? (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.highlight,
              {
                left: hole.x,
                top: hole.y,
                width: hole.width,
                height: hole.height,
              },
            ]}
          />
          {onTargetPress ? (
            <Pressable
              accessibilityRole="button"
              onPress={onTargetPress}
              style={[
                styles.targetPressArea,
                {
                  left: hole.x,
                  top: hole.y,
                  width: hole.width,
                  height: hole.height,
                },
              ]}
            />
          ) : null}
        </>
      ) : null}

      <View
        pointerEvents="none"
        style={[
          styles.calloutWrap,
          {
            left: calloutLeft,
            top: calloutTop,
            width: calloutWidth,
          },
        ]}
      >
        {showArrow && arrowSide === "below" ? (
          <View
            style={[
              styles.arrowUp,
              { marginLeft: arrowOffsetX },
            ]}
          />
        ) : null}
        <View style={styles.callout}>
          <View style={styles.calloutIcon}>
            <Ionicons color={theme.colors.primary} name="sparkles-outline" size={16} />
          </View>
          <Text style={styles.calloutTitle}>{title}</Text>
          <Text style={styles.calloutBody}>{body}</Text>
        </View>
        {showArrow && arrowSide === "above" ? (
          <View
            style={[
              styles.arrowDown,
              { marginLeft: arrowOffsetX },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    layer: {
      zIndex: 100,
    },
    dim: {
      position: "absolute",
      backgroundColor: "rgba(0, 0, 0, 0.72)",
    },
    highlight: {
      position: "absolute",
      borderRadius: 22,
      borderWidth: 2,
      borderColor: theme.colors.primary,
      backgroundColor: "rgba(255, 111, 34, 0.10)",
    },
    targetPressArea: {
      position: "absolute",
      backgroundColor: "transparent",
    },
    calloutWrap: {
      position: "absolute",
    },
    arrowUp: {
      width: 18,
      height: 18,
      backgroundColor: theme.colors.surface,
      transform: [{ rotate: "45deg" }],
      marginBottom: -9,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      alignSelf: "flex-start",
    },
    arrowDown: {
      width: 18,
      height: 18,
      backgroundColor: theme.colors.surface,
      transform: [{ rotate: "45deg" }],
      marginTop: -9,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      alignSelf: "flex-start",
    },
    callout: {
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 6,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    calloutIcon: {
      width: 28,
      height: 28,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted,
      alignSelf: "flex-start",
    },
    calloutTitle: {
      color: theme.colors.textPrimary,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.2,
    },
    calloutBody: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
    },
  });
