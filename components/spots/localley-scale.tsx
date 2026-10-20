import { LocalleyScale } from "@/types";
import { cn } from "@/lib/utils";
import { AlertTriangle, Camera, Users, Heart, Sparkles, Crown } from "@/components/ui/icons";

interface LocalleyScaleIndicatorProps {
    score: LocalleyScale;
    className?: string;
    showLabel?: boolean;
}

export function LocalleyScaleIndicator({ score, className, showLabel = true }: LocalleyScaleIndicatorProps) {
    const config = {
        [LocalleyScale.TOURIST_TRAP]: {
            label: "Tourist Trap",
            icon: AlertTriangle,
            color: "text-red-500",
            bg: "bg-red-100 dark:bg-red-900/20",
            border: " ",
        },
        [LocalleyScale.TOURIST_FRIENDLY]: {
            label: "Tourist Friendly",
            icon: Camera,
            color: "text-orange-500",
            bg: "bg-orange-100 dark:bg-orange-900/20",
            border: " ",
        },
        [LocalleyScale.MIXED_CROWD]: {
            label: "Mixed Crowd",
            icon: Users,
            color: "text-yellow-500",
            bg: "bg-yellow-100 dark:bg-yellow-900/20",
            border: " ",
        },
        [LocalleyScale.LOCAL_FAVORITE]: {
            label: "Local Favorite",
            icon: Heart,
            color: "text-green-500",
            bg: "bg-green-100 dark:bg-green-900/20",
            border: " ",
        },
        [LocalleyScale.HIDDEN_GEM]: {
            label: "Hidden Gem",
            icon: Sparkles,
            color: "text-violet-500",
            bg: "bg-violet-100 dark:bg-violet-900/20",
            border: " ",
        },
        [LocalleyScale.LEGENDARY_ALLEY]: {
            label: "Legendary Alley",
            icon: Crown,
            color: "text-fuchsia-500",
            bg: "bg-fuchsia-100 dark:bg-fuchsia-900/20",
            border: " ",
        },
    };

    const { label, icon: Icon, color, bg, border } = config[score];

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <div
                className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
                    color,
                    bg,
                    border
                )}
            >
                <Icon className="h-3.5 w-3.5" />
                {showLabel && <span>{label}</span>}
            </div>
        </div>
    );
}
