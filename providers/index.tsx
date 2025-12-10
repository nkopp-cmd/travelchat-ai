"use client";

import { ReactNode } from "react";
import { SubscriptionProvider } from "./subscription-provider";

interface ProvidersProps {
    children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
    return (
        <SubscriptionProvider>
            {children}
        </SubscriptionProvider>
    );
}
