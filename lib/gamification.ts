export const LEVEL_THRESHOLDS = [
    0,      // Level 1
    100,    // Level 2
    300,    // Level 3
    600,    // Level 4
    1000,   // Level 5
    1500,   // Level 6
    2100,   // Level 7
    2800,   // Level 8
    3600,   // Level 9
    4500    // Level 10
];

export const XP_REWARDS = {
    DISCOVER_SPOT: 50,
    VERIFY_SPOT: 100,
    CREATE_ITINERARY: 30,
    SHARE_SPOT: 10,
    DAILY_LOGIN: 10,
    STREAK_BONUS: 20,
};

export function getLevel(xp: number): number {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
        if (xp >= LEVEL_THRESHOLDS[i]) {
            return i + 1;
        }
    }
    return 1;
}

export function getNextLevelXp(currentLevel: number): number {
    if (currentLevel >= LEVEL_THRESHOLDS.length) {
        return LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] * 1.5; // Infinite scaling for now
    }
    return LEVEL_THRESHOLDS[currentLevel];
}

export function getLevelProgress(xp: number): number {
    const currentLevel = getLevel(xp);
    const currentLevelXp = LEVEL_THRESHOLDS[currentLevel - 1];
    const nextLevelXp = getNextLevelXp(currentLevel);

    const xpInLevel = xp - currentLevelXp;
    const xpNeeded = nextLevelXp - currentLevelXp;

    return Math.min(100, Math.max(0, (xpInLevel / xpNeeded) * 100));
}

export const RANKS = [
    "Novice Explorer",
    "Alley Cat",
    "Local Scout",
    "Urban Ranger",
    "Wanderer",
    "Pathfinder",
    "Hidden Gem Hunter",
    "City Legend",
    "Master Guide",
    "Localley God"
];

export function getRankTitle(level: number): string {
    return RANKS[Math.min(level, RANKS.length) - 1] || "Explorer";
}
