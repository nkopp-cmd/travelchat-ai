// QueryProvider lives in the (list) and [id] layouts: the planner (/itineraries/new) and the
// preview never use React Query, so its client stays out of their first-screen JS.
// Push CH1: the markup of <AppBackground ambient fitParent contentClassName="flex">, rendered on the server.
// The client AppBackground (cn -> tailwind-merge, ~8 KB gzip) put its JS on the planner first screen.
export default function ItinerariesLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="relative min-h-0 overflow-hidden page-premium bg-background">
            <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgb(124_58_237/0.06),transparent_65%)]" />
            </div>
            <div className="relative z-10 flex">
                <div className="min-w-0 flex-1 bg-transparent p-2 pb-4 sm:p-4 md:p-8 md:pb-8">{children}</div>
            </div>
        </div>
    );
}
