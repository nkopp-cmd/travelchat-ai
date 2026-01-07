"use client";

import { ReactNode } from "react";
import { QueryProvider } from "@/lib/query-client";
import { SubscriptionProvider } from "./subscription-provider";

interface ProvidersProps {
    children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
    return (
        <QueryProvider>
            <SubscriptionProvider>
                {children}
            </SubscriptionProvider>
        </QueryProvider>
    );
}
