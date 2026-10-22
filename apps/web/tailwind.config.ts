import type { Config } from 'tailwindcss';

/**
 * HigherStudy theme — "softer indigo".
 * Indigo stays the brand; everything around it is calmer: a cool lavender-grey
 * canvas, indigo-slate ink instead of black, hairline borders, larger radii and
 * almost no shadow. `night` is the one deep surface (recommended plan, setup
 * panel, guided-tour card).
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          25: '#F7F7FF',
          50: '#EEF0FF',
          100: '#E0E3FF',
          200: '#C7CBFE',
          300: '#A5A9FC',
          400: '#8183F8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
        },
        night: { DEFAULT: '#1E1B4B', soft: '#2A2766', line: '#3B3880' },
        canvas: '#F3F4F9',
        ink: { DEFAULT: '#1C1F3A', soft: '#4B5070', mute: '#6E7391', faint: '#A0A4BD' },
        line: { DEFAULT: '#E7E8F1', soft: '#EFF0F6' },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '18px' },
      boxShadow: {
        card: '0 1px 2px rgba(28,31,58,0.04)',
        lift: '0 1px 2px rgba(28,31,58,0.05), 0 4px 12px -2px rgba(28,31,58,0.06)',
        pop: '0 16px 40px -12px rgba(30,27,75,0.22)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        pulse_ring: { '0%': { boxShadow: '0 0 0 0 rgba(79,70,229,0.45)' }, '70%': { boxShadow: '0 0 0 8px rgba(79,70,229,0)' }, '100%': { boxShadow: '0 0 0 0 rgba(79,70,229,0)' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'fade-up': 'fade-up 220ms ease-out both',
        'pulse-ring': 'pulse_ring 2s ease-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
