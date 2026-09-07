"use client";

import { ReactNode } from "react";
import { QueryProvider } from "@/lib/query-client";
import { SubscriptionProvider } from "./subscription-provider";
import { ServiceWorkerRegistration } from "./service-worker-registration";

interface ProvidersProps {
    children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
    return (
        <QueryProvider>
            <ServiceWorkerRegistration />
            <SubscriptionProvider>
                {children}
            </SubscriptionProvider>
        </QueryProvider>
    );
}
