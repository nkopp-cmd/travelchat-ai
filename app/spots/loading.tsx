export default function SpotsLoading() {
    return (
        <div className="max-w-7xl mx-auto p-4 space-y-6 animate-pulse">
            {/* Header Skeleton */}
            <div className="space-y-2">
                <div className="h-8 bg-muted rounded w-48"></div>
                <div className="h-4 bg-muted rounded w-96"></div>
            </div>

            {/* Grid Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="space-y-4">
                        <div className="aspect-video bg-muted rounded-xl"></div>
                        <div className="space-y-2">
                            <div className="h-6 bg-muted rounded w-3/4"></div>
                            <div className="h-4 bg-muted rounded w-1/2"></div>
                            <div className="h-4 bg-muted rounded w-full"></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
