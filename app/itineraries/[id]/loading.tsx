export default function ItineraryDetailsLoading() {
    return (
        <div className="max-w-4xl mx-auto p-4 space-y-6 animate-pulse">
            {/* Back Button Skeleton */}
            <div className="h-8 bg-muted rounded w-32"></div>

            {/* Header Skeleton */}
            <div className="space-y-4">
                <div className="h-10 bg-muted rounded w-3/4"></div>
                <div className="flex gap-4">
                    <div className="h-6 bg-muted rounded w-24"></div>
                    <div className="h-6 bg-muted rounded w-24"></div>
                    <div className="h-6 bg-muted rounded w-32"></div>
                </div>
            </div>

            {/* Days Skeleton */}
            <div className="space-y-6">
                {[1, 2, 3].map((day) => (
                    <div key={day} className="border rounded-2xl p-6 space-y-4">
                        <div className="h-6 bg-muted rounded w-32"></div>
                        <div className="space-y-3">
                            {[1, 2, 3].map((activity) => (
                                <div key={activity} className="flex gap-4">
                                    <div className="h-12 w-12 bg-muted rounded-full flex-shrink-0"></div>
                                    <div className="flex-1 space-y-2">
                                        <div className="h-5 bg-muted rounded w-1/2"></div>
                                        <div className="h-4 bg-muted rounded w-full"></div>
                                        <div className="h-4 bg-muted rounded w-3/4"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
