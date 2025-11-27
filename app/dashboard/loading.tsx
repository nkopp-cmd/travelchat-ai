export default function DashboardLoading() {
    return (
        <div className="max-w-7xl mx-auto p-4 space-y-6 animate-pulse">
            {/* Header Skeleton */}
            <div className="space-y-2">
                <div className="h-8 bg-muted rounded w-48"></div>
                <div className="h-4 bg-muted rounded w-64"></div>
            </div>

            {/* Map Skeleton */}
            <div className="h-96 bg-muted rounded-3xl"></div>

            {/* Cards Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-48 bg-muted rounded-2xl"></div>
                ))}
            </div>

            {/* Chat Skeleton */}
            <div className="h-64 bg-muted rounded-2xl"></div>
        </div>
    );
}
