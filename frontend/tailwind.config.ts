import type { Config } from 'tailwindcss'

const hsl = (name: string) => `hsl(var(--${name}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        background: hsl('background'),
        foreground: hsl('foreground'),
        card: { DEFAULT: hsl('card'), foreground: hsl('card-foreground') },
        muted: { DEFAULT: hsl('muted'), foreground: hsl('muted-foreground') },
        border: hsl('border'),
        input: hsl('input'),
        ring: hsl('ring'),
        primary: { DEFAULT: hsl('primary'), foreground: hsl('primary-foreground') },
        accent: { DEFAULT: hsl('accent'), foreground: hsl('accent-foreground') },
        // Reserved for verification + severity only
        success: { DEFAULT: hsl('success'), soft: hsl('success-soft') },
        warning: { DEFAULT: hsl('warning'), soft: hsl('warning-soft') },
        danger: { DEFAULT: hsl('danger'), soft: hsl('danger-soft') },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      keyframes: {
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'row-in': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'slide-in-right': 'slide-in-right 200ms ease-out',
        'row-in': 'row-in 220ms ease-out',
      },
    },
  },
} satisfies Config
