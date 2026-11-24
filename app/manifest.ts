import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TablePulse",
    short_name: "TablePulse",
    description: "QR waitlist and digital buzzer for restaurants.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#171513",
    theme_color: "#1c1917",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
