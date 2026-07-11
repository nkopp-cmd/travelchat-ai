export default function SpotsLoading() {
    return (
        <div
            className="mx-auto w-full max-w-7xl space-y-5 p-3 sm:space-y-6 sm:p-4"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-busy="true"
        >
            <span className="sr-only">Loading spots</span>
            <div className="animate-pulse" aria-hidden="true">
                {/* Header Skeleton */}
                <div className="space-y-2">
                    <div className="h-8 w-48 max-w-full rounded bg-muted" />
                    <div className="h-4 w-96 max-w-full rounded bg-muted" />
                </div>

                {/* Grid Skeleton */}
                <div className="mt-5 grid grid-cols-1 gap-4 sm:mt-6 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="min-w-0 space-y-4">
                            <div className="aspect-video rounded-lg bg-muted" />
                            <div className="space-y-2">
                                <div className="h-6 w-3/4 rounded bg-muted" />
                                <div className="h-4 w-1/2 rounded bg-muted" />
                                <div className="h-4 w-full rounded bg-muted" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
