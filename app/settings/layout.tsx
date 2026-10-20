import { Suspense } from "react";
import { SubscriptionSuccessHandler } from "@/components/subscription/subscription-success-handler";
import { AppBackground } from "@/components/layout/app-background";

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AppBackground ambient fitParent className="h-full" contentClassName="flex h-full">
            <div className="flex-1 overflow-y-auto bg-transparent pb-24 md:pb-8">
                {/* Handle post-checkout cache invalidation */}
                <Suspense fallback={null}>
                    <SubscriptionSuccessHandler />
                </Suspense>
                {children}
            </div>
        </AppBackground>
    );
}
