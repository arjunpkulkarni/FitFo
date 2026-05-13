import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "App health",
  robots: { index: false, follow: false },
};

export default function AppHealthDashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
