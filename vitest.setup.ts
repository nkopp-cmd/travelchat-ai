import '@testing-library/dom';
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
    cleanup();
});

// Mock Next.js router
const mockRouter = {
    push: () => Promise.resolve(),
    replace: () => Promise.resolve(),
    prefetch: () => Promise.resolve(),
    back: () => {},
    forward: () => {},
    refresh: () => {},
};

// Mock next/navigation
vi.mock('next/navigation', () => ({
    useRouter: () => mockRouter,
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
    redirect: (url: string) => { throw new Error(`Redirect to ${url}`); },
}));

// Mock next/image
vi.mock('next/image', () => ({
    default: ({ src, alt, ...props }: { src: string; alt: string }) => {
        return `<img src="${src}" alt="${alt}" />`;
    },
}));
