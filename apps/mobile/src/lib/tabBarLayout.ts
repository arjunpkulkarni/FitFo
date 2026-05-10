import { useWindowDimensions } from "react-native";

/**
 * Scroll content bottom inset so lists clear the floating `BottomNav` pill on
 * all phone sizes (SE through Pro Max) and common Android aspect ratios.
 */
export function useTabBarScrollPadding(): number {
  const { width, height } = useWindowDimensions();
  const shortest = Math.min(width, height);
  // Base visual clearance for the nav chip + comfortable scroll end.
  let pad = 128;
  if (shortest < 360) {
    pad = 118;
  } else if (shortest > 420) {
    pad = 142;
  }
  return pad;
}
