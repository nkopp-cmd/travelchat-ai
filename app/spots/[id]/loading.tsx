export default function SpotDetailsLoading() {
    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-pulse p-4">
            {/* Back Button Skeleton */}
            <div className="h-8 bg-muted rounded w-32"></div>

            {/* Hero Image Skeleton */}
            <div className="relative aspect-[21/9] w-full rounded-3xl bg-muted"></div>

            {/* Content Grid Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Tags */}
                    <div className="flex gap-2">
                        <div className="h-6 bg-muted rounded w-20"></div>
                        <div className="h-6 bg-muted rounded w-24"></div>
                        <div className="h-6 bg-muted rounded w-20"></div>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <div className="h-4 bg-muted rounded w-full"></div>
                        <div className="h-4 bg-muted rounded w-full"></div>
                        <div className="h-4 bg-muted rounded w-3/4"></div>
                    </div>

                    {/* Insights Card */}
                    <div className="border rounded-2xl p-6 space-y-4">
                        <div className="h-6 bg-muted rounded w-48"></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="h-24 bg-muted rounded-xl"></div>
                            <div className="h-24 bg-muted rounded-xl"></div>
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    <div className="border rounded-2xl p-6 space-y-6">
                        <div className="h-32 bg-muted rounded"></div>
                        <div className="h-12 bg-muted rounded-xl"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
