import { Sidebar } from "@/components/layout/sidebar";
import { AppBackground } from "@/components/layout/app-background";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AppBackground ambient fitParent className="h-full" contentClassName="flex h-full">
            <Sidebar />
            <main className="flex-1 overflow-y-auto bg-transparent p-3 pb-24 sm:p-4 md:rounded-tl-2xl md:p-8 md:pb-8">
                {children}
            </main>
        </AppBackground>
    );
}
