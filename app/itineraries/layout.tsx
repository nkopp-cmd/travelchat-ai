import { Sidebar } from "@/components/layout/sidebar";

export default function ItinerariesLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-full">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-4 md:p-8 md:rounded-tl-2xl bg-background">
                {children}
            </main>
        </div>
    );
}
