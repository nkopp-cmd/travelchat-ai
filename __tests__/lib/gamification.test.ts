import { describe, it, expect } from 'vitest';
import {
    getLevel,
    getNextLevelXp,
    getLevelProgress,
    getRankTitle,
    LEVEL_THRESHOLDS,
    XP_REWARDS,
    RANKS,
} from '@/lib/gamification';

describe('Gamification', () => {
    describe('getLevel', () => {
        it('should return level 1 for 0 XP', () => {
            expect(getLevel(0)).toBe(1);
        });

        it('should return level 1 for 99 XP', () => {
            expect(getLevel(99)).toBe(1);
        });

        it('should return level 2 for 100 XP', () => {
            expect(getLevel(100)).toBe(2);
        });

        it('should return level 3 for 300 XP', () => {
            expect(getLevel(300)).toBe(3);
        });

        it('should return level 10 for 4500+ XP', () => {
            expect(getLevel(4500)).toBe(10);
            expect(getLevel(10000)).toBe(10);
        });

        it('should handle negative XP gracefully', () => {
            expect(getLevel(-100)).toBe(1);
        });
    });

    describe('getNextLevelXp', () => {
        it('should return 100 for level 1', () => {
            expect(getNextLevelXp(1)).toBe(100);
        });

        it('should return 300 for level 2', () => {
            expect(getNextLevelXp(2)).toBe(300);
        });

        it('should return scaled value for max level', () => {
            expect(getNextLevelXp(10)).toBe(4500 * 1.5);
        });
    });

    describe('getLevelProgress', () => {
        it('should return 0 for start of level', () => {
            expect(getLevelProgress(0)).toBe(0);
            expect(getLevelProgress(100)).toBe(0);
        });

        it('should return 50 for halfway through level', () => {
            // Level 1: 0-100, halfway is 50
            expect(getLevelProgress(50)).toBe(50);
        });

        it('should cap at 100', () => {
            expect(getLevelProgress(99)).toBeLessThanOrEqual(100);
        });
    });

    describe('getRankTitle', () => {
        it('should return correct rank titles', () => {
            expect(getRankTitle(1)).toBe('Novice Explorer');
            expect(getRankTitle(5)).toBe('Wanderer');
            expect(getRankTitle(10)).toBe('Localley God');
        });

        it('should handle out of bounds levels', () => {
            expect(getRankTitle(0)).toBe('Explorer');
            expect(getRankTitle(15)).toBe('Localley God');
        });
    });

    describe('XP_REWARDS', () => {
        it('should have all expected reward types', () => {
            expect(XP_REWARDS.DISCOVER_SPOT).toBe(50);
            expect(XP_REWARDS.VERIFY_SPOT).toBe(100);
            expect(XP_REWARDS.CREATE_ITINERARY).toBe(30);
            expect(XP_REWARDS.SHARE_SPOT).toBe(10);
            expect(XP_REWARDS.DAILY_LOGIN).toBe(10);
            expect(XP_REWARDS.STREAK_BONUS).toBe(20);
        });
    });

    describe('LEVEL_THRESHOLDS', () => {
        it('should have 10 levels', () => {
            expect(LEVEL_THRESHOLDS).toHaveLength(10);
        });

        it('should be in ascending order', () => {
            for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
                expect(LEVEL_THRESHOLDS[i]).toBeGreaterThan(LEVEL_THRESHOLDS[i - 1]);
            }
        });
    });

    describe('RANKS', () => {
        it('should have 10 ranks', () => {
            expect(RANKS).toHaveLength(10);
        });
    });
});
