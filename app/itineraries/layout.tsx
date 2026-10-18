import { Sidebar } from "@/components/layout/sidebar";
import { AppBackground } from "@/components/layout/app-background";

export default function ItinerariesLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AppBackground ambient fitParent contentClassName="flex">
            <Sidebar />
            <div className="min-w-0 flex-1 bg-transparent p-2 pb-4 sm:p-4 md:rounded-tl-2xl md:p-8 md:pb-8">
                {children}
            </div>
        </AppBackground>
    );
}
