import { describe, it, expect } from 'vitest';
import {
    chatSchema,
    generateItinerarySchema,
    saveItinerarySchema,
    gamificationActionSchema,
    idParamSchema,
} from '@/lib/validations';

describe('Validation Schemas', () => {
    describe('chatSchema', () => {
        it('should validate valid chat messages', () => {
            const validData = {
                messages: [
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi there!' },
                ],
            };
            const result = chatSchema.safeParse(validData);
            expect(result.success).toBe(true);
        });

        it('should reject empty messages array', () => {
            const invalidData = { messages: [] };
            const result = chatSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
        });

        it('should reject invalid role', () => {
            const invalidData = {
                messages: [{ role: 'invalid', content: 'Hello' }],
            };
            const result = chatSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
        });

        it('should reject empty content', () => {
            const invalidData = {
                messages: [{ role: 'user', content: '' }],
            };
            const result = chatSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
        });
    });

    describe('generateItinerarySchema', () => {
        it('should validate valid itinerary generation request', () => {
            const validData = {
                city: 'Tokyo',
                days: 3,
                interests: ['food', 'culture'],
                budget: 'moderate',
                pace: 'relaxed',
            };
            const result = generateItinerarySchema.safeParse(validData);
            expect(result.success).toBe(true);
        });

        it('should validate minimal required fields', () => {
            const minimalData = {
                city: 'Seoul',
                days: 1,
            };
            const result = generateItinerarySchema.safeParse(minimalData);
            expect(result.success).toBe(true);
        });

        it('should reject days > 14', () => {
            const invalidData = {
                city: 'Tokyo',
                days: 15,
            };
            const result = generateItinerarySchema.safeParse(invalidData);
            expect(result.success).toBe(false);
        });

        it('should reject days < 1', () => {
            const invalidData = {
                city: 'Tokyo',
                days: 0,
            };
            const result = generateItinerarySchema.safeParse(invalidData);
            expect(result.success).toBe(false);
        });

        it('should reject invalid budget', () => {
            const invalidData = {
                city: 'Tokyo',
                days: 3,
                budget: 'unlimited',
            };
            const result = generateItinerarySchema.safeParse(invalidData);
            expect(result.success).toBe(false);
        });
    });

    describe('saveItinerarySchema', () => {
        it('should validate valid save request', () => {
            const validData = {
                title: 'My Trip to Tokyo',
                city: 'Tokyo',
                days: 3,
                activities: [{ day: 1, activities: [] }],
            };
            const result = saveItinerarySchema.safeParse(validData);
            expect(result.success).toBe(true);
        });

        it('should reject empty title', () => {
            const invalidData = {
                title: '',
                city: 'Tokyo',
                days: 3,
                activities: [{ day: 1 }],
            };
            const result = saveItinerarySchema.safeParse(invalidData);
            expect(result.success).toBe(false);
        });

        it('should reject empty activities array', () => {
            const invalidData = {
                title: 'My Trip',
                city: 'Tokyo',
                days: 3,
                activities: [],
            };
            const result = saveItinerarySchema.safeParse(invalidData);
            expect(result.success).toBe(false);
        });
    });

    describe('gamificationActionSchema', () => {
        it('should validate valid actions', () => {
            const validActions = [
                'verify',
                'verify_spot',
                'share',
                'share_spot',
                'checkin',
                'discover_spot',
                'create_itinerary',
                'daily_login',
                'streak_bonus',
            ];

            validActions.forEach((action) => {
                const result = gamificationActionSchema.safeParse({ action });
                expect(result.success).toBe(true);
            });
        });

        it('should reject invalid action', () => {
            const invalidData = { action: 'invalid_action' };
            const result = gamificationActionSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
        });
    });

    describe('idParamSchema', () => {
        it('should validate valid UUID', () => {
            const validData = { id: '550e8400-e29b-41d4-a716-446655440000' };
            const result = idParamSchema.safeParse(validData);
            expect(result.success).toBe(true);
        });

        it('should reject invalid UUID', () => {
            const invalidData = { id: 'not-a-uuid' };
            const result = idParamSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
        });
    });
});
