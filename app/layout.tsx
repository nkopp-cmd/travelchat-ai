import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from '@clerk/nextjs';

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
    default: "Localley - AI Travel Companion",
    template: "%s | Localley",
  },
  description: "Discover hidden gems and trendy spots with your AI travel companion. Experience cities like a local.",
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
        alt: "Localley App Interface",
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
  },
};

import { ConditionalNavbar } from "@/components/layout/conditional-navbar";
import { Toaster } from "@/components/ui/toaster";

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
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
        >
          <ConditionalNavbar />
          <main className="flex-1">{children}</main>
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
