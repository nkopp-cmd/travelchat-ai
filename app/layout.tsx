import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from '@clerk/nextjs';
import { OrganizationJsonLd, WebsiteJsonLd } from "@/components/seo/json-ld";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Localley - AI Travel Companion | Discover Hidden Gems",
    template: "%s | Localley",
  },
  description: "Discover hidden gems and trendy spots with your AI travel companion. Experience cities like a local with personalized itineraries for Seoul, Tokyo, Bangkok, and Singapore.",
  keywords: "AI travel companion, hidden gems, local spots, travel itinerary, Seoul travel, Tokyo guide, Bangkok tips, Singapore attractions, trip planner",
  manifest: "/manifest.json",
  themeColor: "#7c3aed",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
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
    title: "Localley - AI Travel Companion",
    description: "Your local guide to trendy alley spots & hidden gems. Plan your perfect trip with AI.",
    url: "https://localley.ai",
    siteName: "Localley",
    images: [
      {
        url: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=1200&h=630&auto=format&fit=crop",
        width: 1200,
        height: 630,
        alt: "Localley - AI Travel Companion App",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Localley - AI Travel Companion",
    description: "Discover hidden gems and trendy spots with your AI travel companion.",
    images: ["https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=1200&h=630&auto=format&fit=crop"],
    creator: "@localleyapp",
  },
  alternates: {
    canonical: "https://localley.ai",
  },
  verification: {
    // Add verification IDs when available
    // google: 'your-google-verification-id',
    // yandex: 'your-yandex-verification-id',
  },
};

import { ConditionalNavbar } from "@/components/layout/conditional-navbar";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/providers";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: undefined,
        variables: {
          colorPrimary: "#7c3aed", // violet-600
          colorBackground: "#ffffff",
          colorText: "#0f172a",
        },
      }}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignInUrl="/dashboard"
      afterSignUpUrl="/dashboard"
    >
      <html lang="en">
        <head>
          <OrganizationJsonLd />
          <WebsiteJsonLd />
        </head>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
        >
          <Providers>
            <ConditionalNavbar />
            <main className="flex-1">{children}</main>
            <Toaster />
          </Providers>
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
