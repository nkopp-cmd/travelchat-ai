import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SkeletonProps {
    className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            className={cn(
                "animate-pulse rounded-md bg-muted",
                className
            )}
        />
    );
}

// Spot Card Skeleton
export function SpotCardSkeleton() {
    return (
        <Card className="overflow-hidden h-full flex flex-col">
            <div className="relative aspect-video w-full overflow-hidden">
                <Skeleton className="w-full h-full" />
            </div>
            <CardHeader className="p-4 pb-2">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent className="p-4 pt-0 flex-1">
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-5/6" />
            </CardContent>
            <CardFooter className="p-4 pt-0 border-t bg-muted/50">
                <div className="flex items-center justify-between w-full">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                </div>
            </CardFooter>
        </Card>
    );
}

// Chat Message Skeleton
export function ChatMessageSkeleton() {
    return (
        <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="rounded-2xl px-5 py-4 bg-muted/50 border border-border/40 max-w-[85%] space-y-2">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-56" />
            </div>
        </div>
    );
}

// Story Bubble Skeleton
export function StoryBubbleSkeleton() {
    return (
        <div className="flex flex-col items-center gap-2 min-w-[80px]">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-3 w-12" />
        </div>
    );
}

// Itinerary Card Skeleton
export function ItineraryCardSkeleton() {
    return (
        <Card className="p-6 space-y-4">
            <div className="space-y-2">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
            </div>
            <div className="flex gap-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-24" />
            </div>
        </Card>
    );
}

// Profile Stats Skeleton
export function ProfileStatsSkeleton() {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
                <Card key={i} className="p-4">
                    <Skeleton className="h-4 w-16 mb-2" />
                    <Skeleton className="h-8 w-12" />
                </Card>
            ))}
        </div>
    );
}

// Table Row Skeleton
export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
    return (
        <div className="flex items-center gap-4 p-4 border-b">
            {[...Array(columns)].map((_, i) => (
                <Skeleton key={i} className="h-4 flex-1" />
            ))}
        </div>
    );
}

// Form Field Skeleton
export function FormFieldSkeleton() {
    return (
        <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
        </div>
    );
}

// Grid Skeleton
export function GridSkeleton({
    count = 6,
    columns = 3
}: {
    count?: number;
    columns?: number;
}) {
    return (
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${columns} gap-6`}>
            {[...Array(count)].map((_, i) => (
                <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
        </div>
    );
}

// Page Header Skeleton
export function PageHeaderSkeleton() {
    return (
        <div className="space-y-4 mb-8">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-4 w-96" />
        </div>
    );
}
