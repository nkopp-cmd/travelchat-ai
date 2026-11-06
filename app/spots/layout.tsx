import { AppBackground } from "@/components/layout/app-background";

// Metadata lives in each page (canonical + share image per URL); a layout title would stop the root template.
export default function SpotsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AppBackground ambient fitParent className="min-h-full" contentClassName="flex min-h-full">
            <div className="min-w-0 flex-1 bg-transparent p-3 pb-24 sm:p-4 md:p-8 md:pb-8">
                {children}
            </div>
        </AppBackground>
    );
}
