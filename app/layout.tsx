import type { Metadata, Viewport } from "next";
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

const clerkLocalization = {
  signIn: {
    start: {
      title: "Sign in to Localley",
      titleCombined: "Sign in to Localley",
      subtitle: "Continue planning local-first trips across Asia.",
      subtitleCombined: "Continue planning local-first trips across Asia.",
      actionText: "New to Localley?",
      actionLink: "Create an account",
    },
  },
  signUp: {
    start: {
      title: "Join Localley",
      titleCombined: "Join Localley",
      subtitle: "Create an account, choose a plan, and start building better routes.",
      subtitleCombined: "Create an account, choose a plan, and start building better routes.",
      actionText: "Already use Localley?",
      actionLink: "Sign in",
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#7c3aed",
};

export const metadata: Metadata = {
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
    url: "https://localley.ai",
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
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/providers";
import { SkipLink } from "@/components/accessibility/skip-link";

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
          colorBackground: "#0f0f1a",
          colorText: "#ffffff",
          colorInputBackground: "#1a1a2e",
          colorInputText: "#ffffff",
        },
      }}
      localization={clerkLocalization}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <html lang="en" className="dark">
        <head>
          <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta name="apple-mobile-web-app-title" content="Localley" />
          <OrganizationJsonLd />
          <WebsiteJsonLd />
        </head>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen h-dvh flex flex-col overflow-hidden`}
        >
          <SkipLink />
          <Providers>
            <ConditionalNavbar />
            <main id="main-content" className="flex-1 min-h-0 pb-16 md:pb-0 overflow-y-auto" tabIndex={-1}>
              {children}
            </main>
            <MobileBottomNav />
            <Toaster />
          </Providers>
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
