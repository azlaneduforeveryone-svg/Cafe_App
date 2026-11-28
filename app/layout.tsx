import type { Metadata, Viewport } from "next";
import "./globals.css";
import { fontVariables } from "./fonts";

const DESCRIPTION =
  "QR waitlist and digital buzzer for restaurants. Guests join from their phone, wait anywhere and get buzzed when their table is ready. No app. English, Arabic and Urdu.";

export const metadata: Metadata = {
  metadataBase: new URL("https://tableandbell.com"),
  title: { default: "Table & Bell | Restaurant waitlist and digital buzzer", template: "%s | Table & Bell" },
  description: DESCRIPTION,
  applicationName: "Table & Bell",
  openGraph: {
    type: "website",
    siteName: "Table & Bell",
    url: "https://tableandbell.com",
    title: "Table & Bell | Restaurant waitlist and digital buzzer",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "Table & Bell", description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: "#1c1917",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
