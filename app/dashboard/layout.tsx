import type { Metadata } from "next";
import { AppBackground } from "@/components/layout/app-background";

// Private app area: keep it out of search indexes.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AppBackground ambient fitParent contentClassName="flex">
            <div className="min-w-0 flex-1 bg-transparent p-3 pb-4 sm:p-4 md:p-8 md:pb-8">
                {children}
            </div>
        </AppBackground>
    );
}
