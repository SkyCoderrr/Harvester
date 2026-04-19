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
        discount: {
          FREE: '#22c55e',
          '_2X_FREE': '#a855f7',
          '_2X': '#3b82f6',
          PERCENT_50: '#eab308',
          PERCENT_30: '#f59e0b',
          PERCENT_70: '#f97316',
          '_2X_PERCENT_50': '#ec4899',
          NORMAL: '#71717a',
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
