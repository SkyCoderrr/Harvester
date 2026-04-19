import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0a0a0f',
          sub: '#13131a',
          elev: '#1a1a24',
        },
        text: {
          primary: '#fafafa',
          muted: '#a1a1aa',
          subtle: '#71717a',
        },
        accent: {
          DEFAULT: '#3b82f6',
          success: '#22c55e',
          warn: '#eab308',
          danger: '#ef4444',
        },
        // FR-V2-26: single source of truth is web/src/lib/discount.ts.
        // This palette is kept in sync for any Tailwind util that still
        // references `discount-*` class names. `PERCENT_30` removed per
        // MTEAM_API §3.3 — value is not real on the wire.
        discount: {
          FREE: '#22c55e',
          '_2X_FREE': '#a855f7',
          '_2X': '#3b82f6',
          PERCENT_50: '#eab308',
          PERCENT_70: '#f97316',
          '_2X_PERCENT_50': '#ec4899',
          NORMAL: '#a1a1aa',
        },
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
