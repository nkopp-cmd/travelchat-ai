import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@/styles/borderless-tokens.css";
import "@/styles/borderless-theme.css";
import { OrganizationJsonLd, WebsiteJsonLd } from "@/components/seo/json-ld";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  // Keep the variable available; the current theme uses system fonts.
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  // Code views load this font when used; do not compete with the public first view.
  preload: false,
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#7c3aed",
};

export const metadata: Metadata = {
  // Absolute URLs resolve against the served host (the sitemap uses www). No root canonical or og:url:
  // a root value is inherited by every page and declared each one a copy of the home page.
  metadataBase: new URL("https://www.localley.io"),
  title: {
    default: "Localley - Local-First Asia Trip Planner",
    template: "%s | Localley",
  },
  description: "Plan local-first routes through Seoul, Tokyo, Bangkok, Singapore, and more Asian cities with restaurants, cafes, neighborhoods, and spots locals actually rate.",
  keywords: "Asia trip planner, local travel guide, hidden gems, local spots, travel itinerary, Seoul travel, Tokyo guide, Bangkok tips, Singapore trip planner",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Localley",
  },
  formatDetection: {
    telephone: false,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    title: "Localley - Local-First Asia Trip Planner",
    description: "Plan routes through restaurants, cafes, neighborhoods, and local spots across Asia.",
    siteName: "Localley",
    images: [
      {
        url: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=1200&h=630&auto=format&fit=crop",
        width: 1200,
        height: 630,
        alt: "Localley local-first Asia trip planner",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Localley - Local-First Asia Trip Planner",
    description: "Plan routes through restaurants, cafes, neighborhoods, and local spots across Asia.",
    images: ["https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=1200&h=630&auto=format&fit=crop"],
    creator: "@localleyapp",
  },
  verification: {
    // Add verification IDs when available
    // google: 'your-google-verification-id',
    // yandex: 'your-yandex-verification-id',
  },
};

import { ConditionalNavbar } from "@/components/layout/conditional-navbar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { MainContentShell } from "@/components/layout/main-content-shell";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/providers";
import { SkipLink } from "@/components/accessibility/skip-link";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" data-localley-design="borderless">
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Localley" />
        <OrganizationJsonLd />
        <WebsiteJsonLd />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-dvh flex flex-col`}
      >
        <SkipLink />
        <Providers>
          <ConditionalNavbar />
          <MainContentShell>
            {children}
          </MainContentShell>
          <MobileBottomNav />
          <Toaster />
        </Providers>
        {/* Vercel Speed Insights only exists on Vercel; Workers builds omit it. */}
      </body>
    </html>
  );
}
