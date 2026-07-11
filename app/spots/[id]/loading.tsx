export default function SpotDetailsLoading() {
    return (
        <div
            className="mx-auto w-full max-w-5xl p-3 sm:p-4"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-busy="true"
        >
            <span className="sr-only">Loading spot details</span>
            <div className="animate-pulse space-y-5 sm:space-y-8" aria-hidden="true">
                {/* Back Button Skeleton */}
                <div className="h-8 w-32 max-w-full rounded bg-muted" />

                {/* Hero Image Skeleton */}
                <div className="relative aspect-[4/3] w-full rounded-lg bg-muted sm:aspect-[16/9] lg:aspect-[21/9]" />

                {/* Content Grid Skeleton */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
                    {/* Main Content */}
                    <div className="min-w-0 space-y-6 lg:col-span-2 lg:space-y-8">
                        {/* Tags */}
                        <div className="flex flex-wrap gap-2">
                            <div className="h-6 w-20 rounded bg-muted" />
                            <div className="h-6 w-24 rounded bg-muted" />
                            <div className="h-6 w-20 rounded bg-muted" />
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                            <div className="h-4 w-full rounded bg-muted" />
                            <div className="h-4 w-full rounded bg-muted" />
                            <div className="h-4 w-3/4 rounded bg-muted" />
                        </div>

                        {/* Insights Card */}
                        <div className="space-y-4 rounded-lg border p-4 sm:p-6">
                            <div className="h-6 w-48 max-w-full rounded bg-muted" />
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                                <div className="h-24 rounded-lg bg-muted" />
                                <div className="h-24 rounded-lg bg-muted" />
                            </div>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="min-w-0 space-y-6">
                        <div className="space-y-6 rounded-lg border p-4 sm:p-6">
                            <div className="h-32 rounded bg-muted" />
                            <div className="h-12 rounded-lg bg-muted" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
