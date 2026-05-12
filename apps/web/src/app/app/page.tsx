import type { Metadata } from "next";

import OpenAppLanding from "./OpenAppLanding";

import { APP_STORE_ID, SITE_URL } from "@/lib/siteUrls";

const CANONICAL = `${SITE_URL}/app`;

export const metadata: Metadata = {
  title: "Open Fitfo",
  description:
    "Open the Fitfo iOS app or continue to download it from the App Store.",
  robots: { index: false, follow: true },
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: "Open Fitfo",
    description:
      "Open the Fitfo iOS app or continue to download it from the App Store.",
    url: CANONICAL,
    siteName: "Fitfo",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Open Fitfo",
    description:
      "Open the Fitfo iOS app or continue to download it from the App Store.",
  },
  other: {
    "apple-itunes-app": `app-id=${APP_STORE_ID}, app-argument=${CANONICAL}`,
  },
};

export default function OpenAppPage() {
  return <OpenAppLanding />;
}
