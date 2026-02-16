import { Suspense } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { SubscriptionSuccessHandler } from "@/components/subscription/subscription-success-handler";

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-full">
            <Sidebar />
            <div className="flex-1 overflow-y-auto md:rounded-tl-2xl bg-background">
                {/* Handle post-checkout cache invalidation */}
                <Suspense fallback={null}>
                    <SubscriptionSuccessHandler />
                </Suspense>
                {children}
            </div>
        </div>
    );
}
