"use client";

import { ReactNode } from "react";
import { ServiceWorkerRegistration } from "./service-worker-registration";

interface ProvidersProps {
    children: ReactNode;
}

// The query cache and the subscription context load only on the routes and islands that use them
// (QueryProvider in their route layouts and in navbar-account), not on every public page.
export function Providers({ children }: ProvidersProps) {
    return (
        <>
            <ServiceWorkerRegistration />
            {children}
        </>
    );
}
