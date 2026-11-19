import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Temantiket Back-office",
    short_name: "Temantiket",
    description: "Booking tiket, VOA Mesir Express, dan kas Temantiket",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    background_color: "#f4f9fd",
    theme_color: "#1fa8e0",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
