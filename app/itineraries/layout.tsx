import { AppBackground } from "@/components/layout/app-background";

// QueryProvider lives in the (list) and [id] layouts: the planner (/itineraries/new) and the
// preview never use React Query, so its client stays out of their first-screen JS.
export default function ItinerariesLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AppBackground ambient fitParent contentClassName="flex">
            <div className="min-w-0 flex-1 bg-transparent p-2 pb-4 sm:p-4 md:p-8 md:pb-8">{children}</div>
        </AppBackground>
    );
}
