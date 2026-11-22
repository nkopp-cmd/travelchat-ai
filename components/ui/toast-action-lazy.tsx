"use client";

import dynamic from "next/dynamic";

// A toast action only renders inside the Toaster, which itself loads Radix Toast with the first
// toast. Importing ToastAction directly would put @radix-ui/react-toast in the caller's first-screen JS.
export const LazyToastAction = dynamic(() => import("@/components/ui/toast").then((module) => module.ToastAction), { ssr: false });
