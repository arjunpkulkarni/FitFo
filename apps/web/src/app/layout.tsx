import type { Metadata } from "next";
import localFont from "next/font/local";

import { FITFO_PRODUCT_FAQ } from "@/content/fitfoProductFaq";
import { APP_STORE_URL, SITE_LOGO_SRC, SITE_URL } from "@/lib/siteUrls";
import { SplashGate } from "@/components/site/SplashGate";

import "./globals.css";

// Self-host the same Fontshare TTFs the mobile app ships. Using next/font/local
// guarantees the fonts ship from our own origin with the site, no CDN race
// that leaves the UI rendered in a system fallback for the first paint.
const satoshi = localFont({
  src: [
    { path: "./fonts/Satoshi-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Satoshi-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/Satoshi-Bold.ttf", weight: "700", style: "normal" },
    { path: "./fonts/Satoshi-Black.ttf", weight: "900", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

const LOGO_URL_PATH = SITE_LOGO_SRC;
const OG_IMAGE_PATH = "/og-image.png";
const DESCRIPTION =
  "TikTok & Reels → workouts you train for real. Tap share, hit the gym. Free on iPhone.";
const OG_TITLE = "Fitfo — stop watching, start lifting";
const SHARE_DESCRIPTION =
  "Turn the fitness videos on your feed into workouts you actually do. Fitfo on iPhone.";
const KEYWORDS = [
  "Fitfo",
  "TikTok workout app",
  "save TikTok workouts",
  "Instagram Reel workout tracker",
  "AI workout from video",
  "how to save workouts from TikTok",
  "fitness app",
  "workout app",
  "AI workout app",
  "Instagram Reels workout app",
  "turn fitness videos into workouts",
  "workout tracker",
  "workout planner",
  "iOS fitness app",
  "exercise parser",
  "AI fitness",
];

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Fitfo",
  title: {
    default: "Fitfo — TikTok & Reels to real workouts · iPhone",
    template: "%s · Fitfo",
  },
  description: DESCRIPTION,
  keywords: KEYWORDS,
  authors: [{ name: "Vaayu Athletics LLC" }],
  creator: "Vaayu Athletics LLC",
  publisher: "Vaayu Athletics LLC",
  category: "Health & Fitness",
  alternates: {
    canonical: "/",
  },
  appleWebApp: {
    capable: true,
    title: "Fitfo",
    statusBarStyle: "black-translucent",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: OG_TITLE,
    description: SHARE_DESCRIPTION,
    url: `${SITE_URL}/`,
    siteName: "Fitfo",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: OG_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: "Fitfo: TikTok and Instagram workouts turned into structured training on iPhone",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: SHARE_DESCRIPTION,
    images: [`${SITE_URL}${OG_IMAGE_PATH}`],
  },
  appLinks: {
    ios: {
      url: APP_STORE_URL,
      app_store_id: "6762418380",
      app_name: "Fitfo",
    },
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

const faqPageMainEntity = FITFO_PRODUCT_FAQ.map((item) => ({
  "@type": "Question" as const,
  name: item.question,
  acceptedAnswer: {
    "@type": "Answer" as const,
    text: item.answer,
  },
}));

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Vaayu Athletics LLC",
      url: SITE_URL,
      logo: `${SITE_URL}${LOGO_URL_PATH}`,
      sameAs: [APP_STORE_URL],
      contactPoint: {
        "@type": "ContactPoint",
        email: "nirv@fitfo.app",
        contactType: "customer support",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Fitfo",
      url: SITE_URL,
      description: DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en-US",
    },
    {
      "@type": ["MobileApplication", "SoftwareApplication"],
      "@id": `${SITE_URL}/#app`,
      name: "Fitfo",
      alternateName: "Fitfo Workout App",
      url: SITE_URL,
      downloadUrl: APP_STORE_URL,
      operatingSystem: "iOS",
      applicationCategory: "HealthApplication",
      applicationSubCategory: "Workout tracker",
      description:
        "Share any TikTok or Instagram Reel workout to Fitfo. AI extracts exercises, sets, and reps into a trainable workout.",
      image: `${SITE_URL}${OG_IMAGE_PATH}`,
      publisher: { "@id": `${SITE_URL}/#organization` },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      featureList: [
        "Import public TikTok and Instagram workout videos",
        "Extract exercises, sets, reps, rest, and notes with AI",
        "Save, schedule, edit, and log workouts on iPhone",
        "Track workout history without ads",
      ],
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/support#faq`,
      mainEntity: faqPageMainEntity,
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${satoshi.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans text-text-primary">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
        <div className="fitfo-cinema-bg relative flex min-h-full flex-col overflow-x-clip">
          {/* Fixed cinematic haze layer (slow drifting orange/violet light). */}
          <div
            aria-hidden
            className="fitfo-haze pointer-events-none fixed inset-0 -z-10"
          />
          <SplashGate>{children}</SplashGate>
        </div>
      </body>
    </html>
  );
}
