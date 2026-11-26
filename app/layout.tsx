import type { Metadata, Viewport } from "next";
import "./globals.css";
import { fontVariables } from "./fonts";

export const metadata: Metadata = {
  title: "Table & Bell | Restaurant waitlist and digital buzzer",
  description: "QR waitlist and digital buzzer for restaurants, in English, Arabic and Urdu.",
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
