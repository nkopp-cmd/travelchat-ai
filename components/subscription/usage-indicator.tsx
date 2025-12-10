"use client";

import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface UsageIndicatorProps {
    label: string;
    current: number;
    limit: number;
    periodLabel?: string;
    className?: string;
    showBadge?: boolean;
}

export function UsageIndicator({
    label,
    current,
    limit,
    periodLabel = "this period",
    className,
    showBadge = false,
}: UsageIndicatorProps) {
    const percentage = Math.min((current / limit) * 100, 100);
    const remaining = Math.max(limit - current, 0);
    const isWarning = percentage >= 75;
    const isExceeded = percentage >= 100;

    return (
        <div className={cn("space-y-1", className)}>
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{label}</span>
                <div className="flex items-center gap-2">
                    <span
                        className={cn(
                            "text-sm",
                            isExceeded && "text-red-600 font-medium",
                            isWarning && !isExceeded && "text-amber-600"
                        )}
                    >
                        {current} / {limit === 999 ? "∞" : limit}
                    </span>
                    {showBadge && (
                        <Badge
                            variant={isExceeded ? "destructive" : isWarning ? "secondary" : "outline"}
                            className="text-xs"
                        >
                            {isExceeded
                                ? "Limit reached"
                                : `${remaining} ${remaining === 1 ? "left" : "left"}`}
                        </Badge>
                    )}
                </div>
            </div>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Progress
                            value={percentage}
                            className={cn(
                                "h-2",
                                isExceeded && "[&>div]:bg-red-500",
                                isWarning && !isExceeded && "[&>div]:bg-amber-500"
                            )}
                        />
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>
                            {current} of {limit === 999 ? "unlimited" : limit} used {periodLabel}
                        </p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    );
}
