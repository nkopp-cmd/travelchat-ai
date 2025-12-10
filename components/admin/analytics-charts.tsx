"use client";

import { cn } from "@/lib/utils";

interface BarChartData {
    label: string;
    value: number;
    color?: string;
}

interface BarChartProps {
    data: BarChartData[];
    title?: string;
    maxValue?: number;
    className?: string;
    showValues?: boolean;
    height?: number;
}

export function HorizontalBarChart({
    data,
    title,
    maxValue,
    className,
    showValues = true,
}: BarChartProps) {
    const max = maxValue || Math.max(...data.map((d) => d.value), 1);

    return (
        <div className={cn("space-y-3", className)}>
            {title && <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>}
            {data.map((item, index) => (
                <div key={index} className="space-y-1">
                    <div className="flex justify-between text-sm">
                        <span className="font-medium">{item.label}</span>
                        {showValues && <span className="text-muted-foreground">{item.value.toLocaleString()}</span>}
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                                width: `${(item.value / max) * 100}%`,
                                backgroundColor: item.color || "hsl(var(--primary))",
                            }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

interface LineChartData {
    date: string;
    value: number;
    secondaryValue?: number;
}

interface LineChartProps {
    data: LineChartData[];
    title?: string;
    className?: string;
    primaryLabel?: string;
    secondaryLabel?: string;
    primaryColor?: string;
    secondaryColor?: string;
}

export function SimpleLineChart({
    data,
    title,
    className,
    primaryLabel = "Primary",
    secondaryLabel = "Secondary",
    primaryColor = "hsl(var(--primary))",
    secondaryColor = "hsl(var(--chart-2))",
}: LineChartProps) {
    const maxValue = Math.max(...data.map((d) => Math.max(d.value, d.secondaryValue || 0)), 1);
    const hasSecondary = data.some((d) => d.secondaryValue !== undefined);

    return (
        <div className={cn("space-y-4", className)}>
            {title && <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>}

            {/* Legend */}
            <div className="flex gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: primaryColor }} />
                    <span>{primaryLabel}</span>
                </div>
                {hasSecondary && (
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: secondaryColor }} />
                        <span>{secondaryLabel}</span>
                    </div>
                )}
            </div>

            {/* Chart area */}
            <div className="h-40 flex items-end gap-1">
                {data.map((item, index) => (
                    <div
                        key={index}
                        className="flex-1 flex flex-col items-center gap-0.5 group"
                    >
                        {/* Bars container */}
                        <div className="w-full flex gap-0.5 items-end h-32">
                            {/* Primary bar */}
                            <div
                                className="flex-1 rounded-t transition-all duration-300 group-hover:opacity-80"
                                style={{
                                    height: `${(item.value / maxValue) * 100}%`,
                                    backgroundColor: primaryColor,
                                    minHeight: item.value > 0 ? "4px" : "0",
                                }}
                            />
                            {/* Secondary bar */}
                            {hasSecondary && (
                                <div
                                    className="flex-1 rounded-t transition-all duration-300 group-hover:opacity-80"
                                    style={{
                                        height: `${((item.secondaryValue || 0) / maxValue) * 100}%`,
                                        backgroundColor: secondaryColor,
                                        minHeight: (item.secondaryValue || 0) > 0 ? "4px" : "0",
                                    }}
                                />
                            )}
                        </div>
                        {/* Date label - show every 5th or if data is small */}
                        {(index % Math.max(Math.floor(data.length / 7), 1) === 0) && (
                            <span className="text-[10px] text-muted-foreground rotate-0">
                                {new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {/* Hover tooltip info */}
            <div className="text-xs text-muted-foreground text-center">
                Hover over bars to see details
            </div>
        </div>
    );
}

interface DonutChartData {
    label: string;
    value: number;
    color: string;
}

interface DonutChartProps {
    data: DonutChartData[];
    title?: string;
    className?: string;
    size?: number;
    centerLabel?: string;
    centerValue?: string | number;
}

export function DonutChart({
    data,
    title,
    className,
    size = 120,
    centerLabel,
    centerValue,
}: DonutChartProps) {
    const total = data.reduce((sum, d) => sum + d.value, 0);
    const strokeWidth = 20;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    // Calculate segments with cumulative offsets using reduce
    const segments = data.reduce<Array<{
        label: string;
        value: number;
        color: string;
        dashLength: number;
        offset: number;
        percentage: number;
    }>>((acc, item) => {
        const percentage = total > 0 ? item.value / total : 0;
        const dashLength = percentage * circumference;
        const offset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].dashLength : 0;
        acc.push({ ...item, dashLength, offset, percentage });
        return acc;
    }, []);

    return (
        <div className={cn("flex flex-col items-center gap-4", className)}>
            {title && <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>}

            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="-rotate-90">
                    {segments.map((segment, index) => (
                        <circle
                            key={index}
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            fill="none"
                            stroke={segment.color}
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${segment.dashLength} ${circumference}`}
                            strokeDashoffset={-segment.offset}
                            className="transition-all duration-500"
                        />
                    ))}
                </svg>

                {/* Center text */}
                {(centerLabel || centerValue) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        {centerValue && (
                            <span className="text-2xl font-bold">{centerValue}</span>
                        )}
                        {centerLabel && (
                            <span className="text-xs text-muted-foreground">{centerLabel}</span>
                        )}
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-3 text-xs">
                {segments.map((segment, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                        <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: segment.color }}
                        />
                        <span>{segment.label}</span>
                        <span className="text-muted-foreground">
                            ({segment.value.toLocaleString()})
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

interface MetricCardProps {
    title: string;
    value: string | number;
    change?: number;
    changeLabel?: string;
    icon?: React.ReactNode;
    className?: string;
}

export function MetricCard({
    title,
    value,
    change,
    changeLabel = "vs last period",
    icon,
    className,
}: MetricCardProps) {
    return (
        <div className={cn(
            "p-4 rounded-xl bg-gradient-to-br from-background to-muted/30 border",
            className
        )}>
            <div className="flex items-start justify-between">
                <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{title}</p>
                    <p className="text-2xl font-bold">{value}</p>
                    {change !== undefined && (
                        <p className={cn(
                            "text-xs",
                            change >= 0 ? "text-green-500" : "text-red-500"
                        )}>
                            {change >= 0 ? "+" : ""}{change}% {changeLabel}
                        </p>
                    )}
                </div>
                {icon && (
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        {icon}
                    </div>
                )}
            </div>
        </div>
    );
}
