export default function ItinerariesLoading() {
    return (
        <div className="max-w-4xl mx-auto p-4 space-y-6 animate-pulse">
            {/* Header Skeleton */}
            <div className="space-y-2">
                <div className="h-8 bg-muted rounded w-64"></div>
                <div className="h-4 bg-muted rounded w-96"></div>
            </div>

            {/* Itinerary Cards Skeleton */}
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="border rounded-2xl p-6 space-y-4">
                        <div className="flex justify-between items-start">
                            <div className="space-y-2 flex-1">
                                <div className="h-6 bg-muted rounded w-1/2"></div>
                                <div className="h-4 bg-muted rounded w-1/3"></div>
                            </div>
                            <div className="h-10 w-10 bg-muted rounded-full"></div>
                        </div>
                        <div className="space-y-2">
                            <div className="h-4 bg-muted rounded w-full"></div>
                            <div className="h-4 bg-muted rounded w-3/4"></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
