import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Body font matches voatemantiket.site; the condensed italic display font
// echoes the bold headlines on the Instagram posts.
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const barlow = Barlow_Condensed({ variable: "--font-barlow", subsets: ["latin"], weight: ["700", "800"], style: ["normal", "italic"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Temantiket", template: "%s · Temantiket" },
  description: "Tiket CGK - CAI dan VOA Mesir Express untuk Masisir dan keluarga, sejak 2019. Mudah, cepat, amanah.",
  appleWebApp: { capable: true, title: "Temantiket", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1fa8e0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${jakarta.variable} ${barlow.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
