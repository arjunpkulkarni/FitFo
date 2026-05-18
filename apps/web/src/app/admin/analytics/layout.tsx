import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

export default function AnalyticsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
