/**
 * Design Tokens for Localley
 *
 * Centralized design system values for consistent styling across the app.
 * Use these tokens instead of hardcoding values in components.
 */

// Spacing scale (based on 4px grid)
export const spacing = {
  xs: '4px',   // 1 unit
  sm: '8px',   // 2 units
  md: '16px',  // 4 units
  lg: '24px',  // 6 units
  xl: '32px', // 8 units
  '2xl': '48px', // 12 units
  '3xl': '64px', // 16 units
} as const;

// Shadow scale
export const shadows = {
  subtle: '0 1px 2px rgba(0,0,0,0.05)',
  card: '0 4px 6px -1px rgba(0,0,0,0.1)',
  elevated: '0 10px 15px -3px rgba(0,0,0,0.1)',
  glow: {
    violet: '0 0 20px rgba(139,92,246,0.15)',
    emerald: '0 0 20px rgba(16,185,129,0.15)',
    amber: '0 0 20px rgba(245,158,11,0.15)',
  },
} as const;

// Border radius scale
export const radii = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  full: '9999px',
} as const;

// Animation durations
export const durations = {
  fast: '150ms',
  normal: '200ms',
  slow: '300ms',
} as const;

// Typography scale
export const typography = {
  // Font sizes with line heights
  hero: { fontSize: '36px', lineHeight: '40px' },
  h1: { fontSize: '30px', lineHeight: '36px' },
  h2: { fontSize: '24px', lineHeight: '32px' },
  h3: { fontSize: '18px', lineHeight: '24px' },
  body: { fontSize: '14px', lineHeight: '20px' },
  small: { fontSize: '12px', lineHeight: '16px' },
  tiny: { fontSize: '10px', lineHeight: '14px' },
} as const;

// Color palette (semantic names)
export const colors = {
  // Primary brand colors
  primary: {
    50: 'rgb(245, 243, 255)',
    100: 'rgb(237, 233, 254)',
    200: 'rgb(221, 214, 254)',
    300: 'rgb(196, 181, 253)',
    400: 'rgb(167, 139, 250)',
    500: 'rgb(139, 92, 246)',  // Main violet
    600: 'rgb(124, 58, 237)',
    700: 'rgb(109, 40, 217)',
    800: 'rgb(91, 33, 182)',
    900: 'rgb(76, 29, 149)',
  },
  // Accent colors for categories
  accent: {
    emerald: 'rgb(16, 185, 129)',
    amber: 'rgb(245, 158, 11)',
    rose: 'rgb(244, 63, 94)',
    cyan: 'rgb(6, 182, 212)',
  },
} as const;

// Z-index scale
export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  modal: 30,
  popover: 40,
  tooltip: 50,
} as const;

// Common Tailwind class combinations for consistent styling
export const cardStyles = {
  base: 'rounded-xl border border-border/50 bg-card transition-all duration-200',
  hover: 'hover:shadow-lg hover:border-violet-300/50 hover:-translate-y-1',
  interactive: 'cursor-pointer active:scale-[0.98]',
} as const;

export const buttonStyles = {
  primary: 'bg-violet-600 hover:bg-violet-700 text-white',
  secondary: 'bg-violet-100 hover:bg-violet-200 text-violet-700 dark:bg-violet-900/30 dark:hover:bg-violet-900/50 dark:text-violet-300',
  ghost: 'hover:bg-muted text-muted-foreground hover:text-foreground',
} as const;

// Badge color schemes (simplified to 3 main variants)
export const badgeStyles = {
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  muted: 'bg-muted text-muted-foreground',
} as const;
